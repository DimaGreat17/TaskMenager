import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { PrismaClient, ProjectRole, SystemRole } from '@prisma/client';
import { z, ZodError } from 'zod';

const db = new PrismaClient();
const app = express();
app.disable('x-powered-by');
app.use(helmet()); app.use(express.json({limit:'512kb'})); app.use(cookieParser());
const origin = process.env.WEB_ORIGIN || 'http://localhost:5173';
app.use((req,res,next)=>{
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('origin') !== origin) {res.status(403).json({error:'Invalid origin'});return;}
  next();
});
type UserInfo = {id:string;username:string;fullName:string;systemRole:SystemRole};
declare global {namespace Express { interface Request { user?: UserInfo } }}
const asyncRoute=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>Promise.resolve(fn(req,res)).catch(next);
const sha=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
const cookieName='taskboard_session';
const sessionTtl=1000*60*60*12;
const loginAttempts=new Map<string,{count:number;until:number}>();
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.post('/api/v1/auth/login',asyncRoute(async(req,res)=>{
  const key=req.ip || 'unknown'; const now=Date.now(); const attempt=loginAttempts.get(key);
  if(attempt && attempt.count>=8 && attempt.until>now){res.status(429).json({error:'Too many attempts'});return;}
  const input=z.object({username:z.string().min(1),password:z.string().min(1)}).parse(req.body);
  const user=await db.user.findUnique({where:{username:input.username}});
  if(!user || !user.isActive || !(await argon2.verify(user.passwordHash,input.password))){
    const prev=attempt && attempt.until>now?attempt.count:0;
    loginAttempts.set(key,{count:prev+1,until:now+15*60_000});
    res.status(401).json({error:'Invalid credentials'});return;
  }
  loginAttempts.delete(key);
  const token=crypto.randomBytes(32).toString('hex');
  await db.session.create({data:{tokenHash:sha(token),userId:user.id,expiresAt:new Date(now+sessionTtl)}});
  res.cookie(cookieName,token,{httpOnly:true,secure:origin.startsWith('https:'),sameSite:'strict',path:'/',maxAge:sessionTtl});
  res.json({id:user.id,username:user.username,fullName:user.fullName,systemRole:user.systemRole});
}));
// Middleware must call next on a successful authentication.
app.use('/api/v1',async(req,res,next)=>{
  if(req.path==='/auth/login')return next();
  try {await (async()=>{
    const token=req.cookies?.[cookieName];
    if(typeof token!=='string'){res.status(401).json({error:'Login required'});return;}
    const session=await db.session.findUnique({where:{tokenHash:sha(token)},include:{user:true}});
    if(!session || session.revokedAt || session.expiresAt<new Date() || !session.user.isActive){res.status(401).json({error:'Session expired'});return;}
    req.user={id:session.user.id,username:session.user.username,fullName:session.user.fullName,systemRole:session.user.systemRole};next();
  })();}catch(err){next(err);}
});
const admin=(user:UserInfo)=>['SUPER_ADMIN','ADMIN'].includes(user.systemRole);
async function membership(req:Request,projectId:string,write=false){
  if(admin(req.user!))return true;
  const member=await db.projectMember.findUnique({where:{projectId_userId:{projectId,userId:req.user!.id}}});
  return !!member && (!write || member.role!=='VIEWER');
}
const checklistSchema=z.array(z.object({id:z.string().uuid(),text:z.string().trim().min(1).max(300),done:z.boolean()})).max(100);
const dueSchema=z.string().datetime({offset:true}).nullable();
const deny=(res:Response)=>res.status(403).json({error:'Insufficient permissions'});
app.get('/api/v1/auth/me',(req,res)=>res.json(req.user));
app.post('/api/v1/auth/logout',asyncRoute(async(req,res)=>{
  const token=req.cookies?.[cookieName]; if(token)await db.session.updateMany({where:{tokenHash:sha(token)},data:{revokedAt:new Date()}});
  res.clearCookie(cookieName,{path:'/'});res.json({ok:true});
}));
app.get('/api/v1/users',asyncRoute(async(req,res)=>{
  if(!admin(req.user!))return deny(res);
  res.json(await db.user.findMany({select:{id:true,username:true,fullName:true,systemRole:true,isActive:true},orderBy:{fullName:'asc'}}));
}));
app.post('/api/v1/users',asyncRoute(async(req,res)=>{
  if(!admin(req.user!))return deny(res);
  const x=z.object({username:z.string().min(3).max(64),fullName:z.string().min(1).max(200),password:z.string().min(12),systemRole:z.enum(['ADMIN','USER']).default('USER')}).parse(req.body);
  const user=await db.user.create({data:{username:x.username,fullName:x.fullName,passwordHash:await argon2.hash(x.password),systemRole:x.systemRole}});
  res.status(201).json({id:user.id,username:user.username,fullName:user.fullName});
}));
app.get('/api/v1/projects',asyncRoute(async(req,res)=>{
  const where=admin(req.user!)?{}:{members:{some:{userId:req.user!.id}}};
  res.json(await db.project.findMany({where,include:{_count:{select:{tasks:true,members:true}}},orderBy:{updatedAt:'desc'}}));
}));
app.post('/api/v1/projects',asyncRoute(async(req,res)=>{
  const x=z.object({name:z.string().min(2).max(200),code:z.string().regex(/^[A-Z0-9_-]{2,24}$/),description:z.string().max(3000).default('')}).parse(req.body);
  const created=await db.project.create({data:{...x,ownerId:req.user!.id,members:{create:{userId:req.user!.id,role:'OWNER'}},columns:{create:[{name:'Запланировано',position:0},{name:'В работе',position:1},{name:'На проверке',position:2},{name:'Завершено',position:3,isTerminal:true}]},boards:{create:{name:'Основная доска'}}}});
  res.status(201).json(created);
}));
app.get('/api/v1/projects/:id',asyncRoute(async(req,res)=>{
  if(!await membership(req,req.params.id))return deny(res);
  const project=await db.project.findUnique({where:{id:req.params.id},include:{columns:{orderBy:{position:'asc'}},members:{include:{user:{select:{id:true,username:true,fullName:true}}}},boards:true}});
  if(!project){res.status(404).json({error:'Not found'});return;}res.json(project);
}));
app.post('/api/v1/projects/:id/members',asyncRoute(async(req,res)=>{
  const project=await db.project.findUnique({where:{id:req.params.id}});
  if(!project){res.status(404).json({error:'Not found'});return;}
  const member=await db.projectMember.findUnique({where:{projectId_userId:{projectId:project.id,userId:req.user!.id}}});
  if(!admin(req.user!) && !['OWNER','MANAGER'].includes(member?.role||''))return deny(res);
  const x=z.object({userId:z.string().uuid(),role:z.enum(['MANAGER','MEMBER','VIEWER'])}).parse(req.body);
  res.status(201).json(await db.projectMember.upsert({where:{projectId_userId:{projectId:project.id,userId:x.userId}},create:{projectId:project.id,...x},update:{role:x.role}}));
}));
app.get('/api/v1/projects/:id/tasks',asyncRoute(async(req,res)=>{
  if(!await membership(req,req.params.id))return deny(res);
  res.json(await db.task.findMany({where:{projectId:req.params.id},orderBy:{position:'asc'},include:{assignee:{select:{id:true,fullName:true}},_count:{select:{comments:true}},column:{select:{isTerminal:true}}}}));
}));
app.post('/api/v1/projects/:id/tasks',asyncRoute(async(req,res)=>{
  if(!await membership(req,req.params.id,true))return deny(res);
  const x=z.object({title:z.string().min(1).max(255),description:z.string().max(10000).default(''),priority:z.enum(['LOW','NORMAL','HIGH','CRITICAL']).default('NORMAL'),columnId:z.string().uuid(),assigneeId:z.string().uuid().nullable().optional(),dueAt:dueSchema.optional(),checklist:checklistSchema.optional()}).parse(req.body);
  const column=await db.kanbanColumn.findUnique({where:{id:x.columnId}});
  if(column?.projectId!==req.params.id){res.status(400).json({error:'Column belongs to another project'});return;}
  if(x.assigneeId && !await db.projectMember.findUnique({where:{projectId_userId:{projectId:req.params.id,userId:x.assigneeId}}})){res.status(400).json({error:'Assignee is not a member'});return;}
  const count=await db.task.count({where:{columnId:x.columnId}});
  res.status(201).json(await db.task.create({data:{...x,dueAt:x.dueAt?new Date(x.dueAt):null,checklist:x.checklist||[],projectId:req.params.id,reporterId:req.user!.id,position:count}}));
}));
app.patch('/api/v1/tasks/:id',asyncRoute(async(req,res)=>{
  const task=await db.task.findUnique({where:{id:req.params.id}});
  if(!task){res.status(404).json({error:'Not found'});return;}
  if(!await membership(req,task.projectId,true))return deny(res);
  const x=z.object({title:z.string().min(1).max(255).optional(),description:z.string().max(10000).optional(),priority:z.enum(['LOW','NORMAL','HIGH','CRITICAL']).optional(),columnId:z.string().uuid().optional(),assigneeId:z.string().uuid().nullable().optional(),dueAt:dueSchema.optional(),checklist:checklistSchema.optional(),version:z.number().int().min(1)}).parse(req.body);
  if(x.columnId){const column=await db.kanbanColumn.findUnique({where:{id:x.columnId}});if(column?.projectId!==task.projectId){res.status(400).json({error:'Wrong project column'});return;}}
  if(x.assigneeId && !await db.projectMember.findUnique({where:{projectId_userId:{projectId:task.projectId,userId:x.assigneeId}}})){res.status(400).json({error:'Assignee is not a member'});return;}
  const {version,...patch}=x;
  const col=x.columnId?await db.kanbanColumn.findUnique({where:{id:x.columnId}}):null;
  const result=await db.task.updateMany({where:{id:task.id,version},data:{...patch,...('dueAt' in patch?{dueAt:patch.dueAt?new Date(patch.dueAt!):null}:{}),version:{increment:1},...(col?{completedAt:col.isTerminal?new Date():null}:{})}});
  if(!result.count){res.status(409).json({error:'Outdated version'});return;}
  res.json(await db.task.findUnique({where:{id:task.id}}));
}));
app.get('/api/v1/tasks/:id/comments',asyncRoute(async(req,res)=>{
  const task=await db.task.findUnique({where:{id:req.params.id},select:{projectId:true}});
  if(!task){res.status(404).json({error:'Not found'});return;}
  if(!await membership(req,task.projectId))return deny(res);
  res.json(await db.taskComment.findMany({where:{taskId:req.params.id},orderBy:{createdAt:'asc'},include:{author:{select:{id:true,fullName:true}}}}));
}));
app.post('/api/v1/tasks/:id/comments',asyncRoute(async(req,res)=>{
  const task=await db.task.findUnique({where:{id:req.params.id},select:{projectId:true}});
  if(!task){res.status(404).json({error:'Not found'});return;}
  if(!await membership(req,task.projectId,true))return deny(res);
  const {body}=z.object({body:z.string().trim().min(1).max(5000)}).parse(req.body);
  const comment=await db.taskComment.create({data:{taskId:req.params.id,authorId:req.user!.id,body},include:{author:{select:{id:true,fullName:true}}}});
  res.status(201).json(comment);
}));
app.get('/api/v1/boards/:id',asyncRoute(async(req,res)=>{
  const board=await db.board.findUnique({where:{id:req.params.id},include:{nodes:true,edges:true}});
  if(!board){res.status(404).json({error:'Not found'});return;}
  if(!await membership(req,board.projectId))return deny(res);
  res.json(board);
}));
app.post('/api/v1/boards/:id/nodes',asyncRoute(async(req,res)=>{
  const board=await db.board.findUnique({where:{id:req.params.id}});
  if(!board){res.status(404).json({error:'Not found'});return;}
  if(!await membership(req,board.projectId,true))return deny(res);
  const x=z.object({type:z.enum(['NOTE','TEXT','SHAPE','TASK']),content:z.string().max(5000).default(''),taskId:z.string().uuid().nullable().optional(),x:z.number().finite().default(0),y:z.number().finite().default(0),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()}).parse(req.body);
  if(x.type==='TASK'){
    const task=x.taskId?await db.task.findUnique({where:{id:x.taskId}}):null;
    if(!task || task.projectId!==board.projectId){res.status(400).json({error:'Invalid task reference'});return;}
  } else if(x.taskId){res.status(400).json({error:'Task reference requires TASK node'});return;}
  res.status(201).json(await db.boardNode.create({data:{boardId:board.id,...x}}));
}));
app.patch('/api/v1/boards/:boardId/nodes/:nodeId',asyncRoute(async(req,res)=>{
  const board=await db.board.findUnique({where:{id:req.params.boardId}});
  const node=await db.boardNode.findUnique({where:{id:req.params.nodeId}});
  if(!board||!node||node.boardId!==board.id){res.status(404).json({error:'Not found'});return;}
  if(!await membership(req,board.projectId,true))return deny(res);
  const x=z.object({content:z.string().max(5000).optional(),x:z.number().finite().optional(),y:z.number().finite().optional(),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),version:z.number().int().min(1)}).parse(req.body);
  const {version,...patch}=x;
  const result=await db.boardNode.updateMany({where:{id:node.id,version},data:{...patch,version:{increment:1}}});
  if(!result.count){res.status(409).json({error:'Outdated version'});return;}
  res.json(await db.boardNode.findUnique({where:{id:node.id}}));
}));
app.delete('/api/v1/boards/:boardId/nodes/:nodeId',asyncRoute(async(req,res)=>{
 const board=await db.board.findUnique({where:{id:req.params.boardId}});
 if(!board){res.status(404).json({error:'Not found'});return;}
 if(!await membership(req,board.projectId,true))return deny(res);
 const node=await db.boardNode.findUnique({where:{id:req.params.nodeId}});
 if(!node||node.boardId!==board.id){res.status(404).json({error:'Not found'});return;}
 await db.$transaction([db.boardEdge.deleteMany({where:{boardId:board.id,OR:[{sourceId:node.id},{targetId:node.id}]}}),db.boardNode.delete({where:{id:node.id}})]);
 res.json({ok:true});
}));
app.post('/api/v1/boards/:id/edges',asyncRoute(async(req,res)=>{
  const board=await db.board.findUnique({where:{id:req.params.id}});
  if(!board){res.status(404).json({error:'Not found'});return;}
  if(!await membership(req,board.projectId,true))return deny(res);
  const x=z.object({sourceId:z.string().uuid(),targetId:z.string().uuid(),label:z.string().max(120).default('')}).parse(req.body);
  const count=await db.boardNode.count({where:{boardId:board.id,id:{in:[x.sourceId,x.targetId]}}});
  if(count!==2||x.sourceId===x.targetId){res.status(400).json({error:'Invalid board nodes'});return;}
  res.status(201).json(await db.boardEdge.create({data:{boardId:board.id,...x}}));
}));
app.get('/api/v1/admin/overview',asyncRoute(async(req,res)=>{
  if(!admin(req.user!))return deny(res);
  const [users,projects,tasks,overdue]=await Promise.all([db.user.count({where:{isActive:true}}),db.project.count(),db.task.count(),db.task.count({where:{dueAt:{lt:new Date()},completedAt:null}})]);
  res.json({users,projects,tasks,overdue});
}));
app.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  if(err instanceof ZodError){res.status(400).json({error:'Validation error',issues:err.issues});return;}
  if(typeof err==='object' && err!==null && 'code' in err && err.code==='P2002'){res.status(409).json({error:'Already exists'});return;}
  console.error(err);res.status(500).json({error:'Internal server error'});
});
const port=Number(process.env.PORT||3001);
app.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`API listening on ${port}`));

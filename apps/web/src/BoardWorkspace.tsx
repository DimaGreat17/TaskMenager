import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ReactFlow,Background,MiniMap,Controls,applyNodeChanges,type Node,type Edge,type NodeChange,type NodeMouseHandler,type Connection,type ReactFlowInstance} from '@xyflow/react';
import {MousePointer2,Network,StickyNote,Type,Square,Link2,Layers3,Layers2,Copy,Clipboard,Trash2,SquarePen,Undo2,Redo2,ZoomIn,ZoomOut,Maximize,RotateCcw} from 'lucide-react';
import NodeDialog from './NodeDialog';
import type {TaskItem} from './TaskDialog';

type Kind='NOTE'|'TEXT'|'SHAPE'|'TASK'|'GROUP';
type CanvasNode={id:string;type:Kind;taskId:string|null;groupId:string|null;content:string;x:number;y:number;width:number;height:number;color:string;version:number};
type CanvasEdge={id:string;sourceId:string;targetId:string;label:string};
type Snapshot={nodes:CanvasNode[];edges:CanvasEdge[]};
type BoardData=Snapshot&{id:string;version:number};
type Mode='select'|'connect';
type Props={boardId:string;tasks:TaskItem[];onEditTask:(task:TaskItem)=>void};
const newId=()=>crypto.randomUUID();
const copied=(snapshot:Snapshot):Snapshot=>({nodes:snapshot.nodes.map(n=>({...n})),edges:snapshot.edges.map(e=>({...e}))});
const unpack=(n:CanvasNode):Node=>({id:n.id,position:{x:n.x,y:n.y},type:'default',data:{label:n.content},draggable:true});
const btn=(label:string,Icon:React.ComponentType<{size?:number}>,action:()=>void,disabled=false,active=false)=><button type="button" className={'tool-btn'+(active?' is-active':'')} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={action}><Icon size={19}/></button>;
export default function BoardWorkspace({boardId,tasks,onEditTask}:Props){
 const [board,setBoard]=useState<BoardData|null>(null);
 const boardRef=useRef<BoardData|null>(null);
 const [busy,setBusy]=useState(false);
 const busyRef=useRef(false);
 const [error,setError]=useState('');
 const [mode,setMode]=useState<Mode>('select');
 const [selected,setSelected]=useState<string[]>([]);
 const [dragPos,setDragPos]=useState<Record<string,{x:number;y:number}>>({});
 const [dialog,setDialog]=useState<{node:CanvasNode|null;type:'NOTE'|'TEXT'|'SHAPE'|'TASK'}|null>(null);
 const [menu,setMenu]=useState<{x:number;y:number;pasteX:number;pasteY:number}|null>(null);
 const [clipboard,setClipboard]=useState<Snapshot|null>(null);
 const [historyCount,setHistoryCount]=useState({undo:0,redo:0});
 const undoRef=useRef<Snapshot[]>([]);
 const redoRef=useRef<Snapshot[]>([]);
 const flow=useRef<ReactFlowInstance<Node,Edge>|null>(null);
 const [viewport,setViewport]=useState(100);
 const load=useCallback(async(resetHistory=false)=>{
   const r=await fetch('/api/v1/boards/'+boardId,{credentials:'same-origin'});
   if(!r.ok)throw Error('Не удалось загрузить доску');
   const data=await r.json() as BoardData;
   boardRef.current=data;setBoard(data);setDragPos({});setSelected([]);
   if(resetHistory){undoRef.current=[];redoRef.current=[];setHistoryCount({undo:0,redo:0})}
 },[boardId]);
 useEffect(()=>{load(true).catch(e=>setError(String(e)))},[load]);
 const commit=useCallback(async(next:Snapshot,record=true)=>{
   const previous=boardRef.current;
   if(!previous||busyRef.current)return false;
   busyRef.current=true;setBusy(true);setError('');
   try{
     const response=await fetch('/api/v1/boards/'+boardId+'/canvas',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:previous.version,nodes:next.nodes.map(({version,...n})=>n),edges:next.edges})});
     const json=await response.json();
     if(!response.ok)throw Object.assign(new Error(json.error||'Не удалось сохранить доску'),{status:response.status});
     const changed={...copied(next),id:boardId,version:json.version} as BoardData;
     boardRef.current=changed;setBoard(changed);setDragPos({});
     if(record){undoRef.current.push(copied(previous));if(undoRef.current.length>50)undoRef.current.shift();redoRef.current=[];}
     setHistoryCount({undo:undoRef.current.length,redo:redoRef.current.length});
     return true;
   }catch(e){
     setError(e instanceof Error?e.message:String(e));
     if((e as {status?:number}).status===409)await load(true);
     return false;
   }finally{busyRef.current=false;setBusy(false)}
 },[boardId,load]);
 const undo=useCallback(async()=>{
   if(!undoRef.current.length||busyRef.current||!boardRef.current)return;
   const target=undoRef.current[undoRef.current.length-1];
   const current=copied(boardRef.current);
   if(await commit(target,false)){undoRef.current.pop();redoRef.current.push(current);setHistoryCount({undo:undoRef.current.length,redo:redoRef.current.length});}
 },[commit]);
 const redo=useCallback(async()=>{
   if(!redoRef.current.length||busyRef.current||!boardRef.current)return;
   const target=redoRef.current[redoRef.current.length-1];
   const current=copied(boardRef.current);
   if(await commit(target,false)){redoRef.current.pop();undoRef.current.push(current);setHistoryCount({undo:undoRef.current.length,redo:redoRef.current.length});}
 },[commit]);
 const chosen=useCallback(()=>{const b=boardRef.current;return b?b.nodes.filter(n=>selected.includes(n.id)):[]},[selected]);
 const remove=useCallback(async()=>{
   const b=boardRef.current;if(!b||!selected.length)return;
   const ids=new Set(selected);
   for(const n of b.nodes)if(n.groupId&&ids.has(n.groupId))ids.add(n.id);
   if(await commit({nodes:b.nodes.filter(n=>!ids.has(n.id)),edges:b.edges.filter(e=>!ids.has(e.sourceId)&&!ids.has(e.targetId))}))setSelected([]);
   setMenu(null);
 },[selected,commit]);
 const duplicate=useCallback(async()=>{
   const b=boardRef.current;if(!b||!selected.length)return;
   const chosenIds=new Set(selected);
   for(const n of b.nodes)if(n.groupId&&chosenIds.has(n.groupId))chosenIds.add(n.id);
   const originals=b.nodes.filter(n=>chosenIds.has(n.id));
   const map=new Map(originals.map(n=>[n.id,newId()]));
   const duplicated=originals.map(n=>({...n,id:map.get(n.id)!,groupId:n.groupId&&map.has(n.groupId)?map.get(n.groupId)!:null,x:n.x+48,y:n.y+48,version:1}));
   const links=b.edges.filter(e=>map.has(e.sourceId)&&map.has(e.targetId)).map(e=>({...e,id:newId(),sourceId:map.get(e.sourceId)!,targetId:map.get(e.targetId)!}));
   if(await commit({nodes:[...b.nodes,...duplicated],edges:[...b.edges,...links]}))setSelected(duplicated.map(n=>n.id));
   setMenu(null);
 },[selected,commit]);
 const copySelection=useCallback(()=>{
   const b=boardRef.current;if(!b||!selected.length)return;
   const ids=new Set(selected);for(const n of b.nodes)if(n.groupId&&ids.has(n.groupId))ids.add(n.id);
   const nodes=b.nodes.filter(n=>ids.has(n.id));
   setClipboard({nodes:nodes.map(n=>({...n})),edges:b.edges.filter(e=>ids.has(e.sourceId)&&ids.has(e.targetId)).map(e=>({...e}))});setMenu(null);
 },[selected]);
 const paste=useCallback(async()=>{
   const b=boardRef.current;if(!b||!clipboard)return;
   const map=new Map(clipboard.nodes.map(n=>[n.id,newId()]));
   const nodes=clipboard.nodes.map(n=>({...n,id:map.get(n.id)!,groupId:n.groupId&&map.has(n.groupId)?map.get(n.groupId)!:null,x:n.x+70,y:n.y+70,version:1}));
   const edges=clipboard.edges.map(e=>({...e,id:newId(),sourceId:map.get(e.sourceId)!,targetId:map.get(e.targetId)!}));
   if(await commit({nodes:[...b.nodes,...nodes],edges:[...b.edges,...edges]}))setSelected(nodes.map(n=>n.id));
   setMenu(null);
 },[clipboard,commit]);
 const group=useCallback(async()=>{
   const b=boardRef.current;if(!b)return;
   const nodes=chosen().filter(n=>n.type!=='GROUP'&&!n.groupId);
   if(nodes.length<2)return;
   const minX=Math.min(...nodes.map(n=>n.x))-30,minY=Math.min(...nodes.map(n=>n.y))-60;
   const maxX=Math.max(...nodes.map(n=>n.x+n.width))+30,maxY=Math.max(...nodes.map(n=>n.y+n.height))+30;
   const id=newId();
   const frame:CanvasNode={id,type:'GROUP',taskId:null,groupId:null,content:'Группа',x:minX,y:minY,width:maxX-minX,height:maxY-minY,color:'#dbeafe',version:1};
   const members=new Set(nodes.map(n=>n.id));
   if(await commit({nodes:[...b.nodes.map(n=>members.has(n.id)?{...n,groupId:id}:n),frame],edges:b.edges}))setSelected([id]);
   setMenu(null);
 },[chosen,commit]);
 const ungroup=useCallback(async()=>{
   const b=boardRef.current;if(!b)return;
   const groupIds=new Set(chosen().filter(n=>n.type==='GROUP').map(n=>n.id));
   if(!groupIds.size)return;
   if(await commit({nodes:b.nodes.filter(n=>!groupIds.has(n.id)).map(n=>n.groupId&&groupIds.has(n.groupId)?{...n,groupId:null}:n),edges:b.edges.filter(e=>!groupIds.has(e.sourceId)&&!groupIds.has(e.targetId))}))setSelected([]);
   setMenu(null);
 },[chosen,commit]);
 const saveNode=async(input:{type:'NOTE'|'TEXT'|'SHAPE'|'TASK';content:string;taskId?:string;color?:string})=>{
   const b=boardRef.current;if(!b)return;
   const prior=dialog?.node;
   const node:CanvasNode=prior?{...prior,content:input.content,color:input.color||prior.color}:{id:newId(),type:input.type,content:input.content,taskId:input.type==='TASK'?input.taskId||null:null,groupId:null,x:150,y:120,width:220,height:120,color:input.color||'#fef08a',version:1};
   if(await commit({nodes:prior?b.nodes.map(n=>n.id===prior.id?node:n):[...b.nodes,node],edges:b.edges})){setDialog(null);setSelected([node.id]);}
   else throw Error('Не удалось сохранить блок');
 };
 const renderedNodes:Node[]=useMemo(()=>!board?[]:board.nodes.map(n=>{
   const group=n.type==='GROUP',task=tasks.find(t=>t.id===n.taskId);
   return {id:n.id,position:dragPos[n.id]||{x:n.x,y:n.y},selected:selected.includes(n.id),data:{label:group?<div className="canvas-group-label">{n.content||'Группа'}</div>:n.type==='TASK'?<div><strong>{task?.title||'Задача удалена'}</strong><div className="canvas-task-detail">{task?.priority||''}{task?.assignee?' · '+task.assignee.fullName:''}</div></div>:<div className="canvas-block-text">{n.content||'Пустой блок'}</div>},style:{width:n.width,height:n.height,borderRadius:group?14:10,border:group?'2px dashed #6a96c4':'1px solid #8794a9',background:group?'rgba(161,198,240,.12)':n.type==='TASK'?'#dbeafe':n.color,color:'#1e293b',boxShadow:group?'none':'0 5px 17px #0002',padding:group?'8px 12px':12,zIndex:group?-1:1},draggable:mode==='select',connectable:mode==='connect'};
 }),[board,dragPos,selected,mode,tasks]);
 const renderedEdges:Edge[]=useMemo(()=>board?board.edges.map(e=>({id:e.id,source:e.sourceId,target:e.targetId,label:e.label,animated:false})):[],[board]);
 const onNodesChange=useCallback((changes:NodeChange[])=>{
   const positions=changes.filter((c):c is Extract<NodeChange,{type:'position'}>=>c.type==='position'&&!!c.position);
   if(positions.length)setDragPos(old=>{const next={...old};for(const c of positions)if(c.position)next[c.id]=c.position;return next});
   const selections=changes.filter((c):c is Extract<NodeChange,{type:'select'}>=>c.type==='select');
   if(selections.length)setSelected(old=>{const result=new Set(old);for(const c of selections)c.selected?result.add(c.id):result.delete(c.id);return [...result]});
 },[]);
 const onDragStop:NodeMouseHandler=useCallback(async(_,node)=>{
   const b=boardRef.current,source=b?.nodes.find(n=>n.id===node.id);if(!b||!source)return;
   const dx=node.position.x-source.x,dy=node.position.y-source.y;
   if(!dx&&!dy)return;
   const moved=new Set([source.id]);
   if(source.type==='GROUP')for(const n of b.nodes)if(n.groupId===source.id)moved.add(n.id);
   const next=b.nodes.map(n=>moved.has(n.id)?{...n,x:n.x+dx,y:n.y+dy}:n);
   await commit({nodes:next,edges:b.edges});
 },[commit]);
 const onConnect=useCallback(async(c:Connection)=>{
   const b=boardRef.current;
   if(!b||!c.source||!c.target||c.source===c.target)return;
   if(b.edges.some(e=>e.sourceId===c.source&&e.targetId===c.target))return;
   await commit({nodes:b.nodes,edges:[...b.edges,{id:newId(),sourceId:c.source,targetId:c.target,label:''}]});
 },[commit]);
 const editSelected=()=>{const n=chosen()[0];if(!n)return;if(n.type==='TASK'){const task=tasks.find(t=>t.id===n.taskId);if(task)onEditTask(task)}else if(n.type!=='GROUP')setDialog({node:n,type:n.type});};
 const handlerRef=useRef({undo,redo,remove,copySelection,paste,duplicate,group,ungroup,editSelected});
 handlerRef.current={undo,redo,remove,copySelection,paste,duplicate,group,ungroup,editSelected};
 useEffect(()=>{
   const onKey=(e:KeyboardEvent)=>{
     if(dialog||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLElement&&e.target.isContentEditable)return;
     const ctrl=e.ctrlKey||e.metaKey, k=e.key.toLowerCase();
     const h=handlerRef.current;
     if(ctrl&&k==='z'){e.preventDefault();e.shiftKey?h.redo():h.undo()}
     else if(ctrl&&k==='y'){e.preventDefault();h.redo()}
     else if(ctrl&&k==='c'){e.preventDefault();h.copySelection()}
     else if(ctrl&&k==='v'){e.preventDefault();h.paste()}
     else if(ctrl&&k==='d'){e.preventDefault();h.duplicate()}
     else if(ctrl&&k==='g'){e.preventDefault();e.shiftKey?h.ungroup():h.group()}
     else if(k==='delete'||k==='backspace'){e.preventDefault();h.remove()}
     else if(k==='enter'){h.editSelected()}
     else if(k==='escape'){setMenu(null);setSelected([])}
   };
   window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[dialog]);
 if(!board)return <div className="board-loading">{error||'Загрузка визуальной доски…'}</div>;
 const groupChosen=chosen().filter(n=>n.type!=='GROUP'&&!n.groupId).length>=2;
 const hasGroup=chosen().some(n=>n.type==='GROUP');
 const actions=<>
  {btn('Выбрать и перемещать · V',MousePointer2,()=>setMode('select'),false,mode==='select')}
  {btn('Соединить блоки стрелками',Network,()=>setMode('connect'),false,mode==='connect')}
  <span className="tool-divider"/>
  {btn('Создать заметку',StickyNote,()=>setDialog({node:null,type:'NOTE'}))}
  {btn('Текстовый блок',Type,()=>setDialog({node:null,type:'TEXT'}))}
  {btn('Фигура',Square,()=>setDialog({node:null,type:'SHAPE'}))}
  {btn('Связать с задачей',Link2,()=>setDialog({node:null,type:'TASK'}))}
  <span className="tool-divider"/>
  {btn('Редактировать выбранный блок · Enter',SquarePen,editSelected,selected.length!==1)}
  {btn('Группировать · Ctrl+G',Layers3,group, !groupChosen)}
  {btn('Разгруппировать · Ctrl+Shift+G',Layers2,ungroup,!hasGroup)}
  {btn('Копировать · Ctrl+C',Copy,copySelection,!selected.length)}
  {btn('Вставить копию · Ctrl+V',Clipboard,()=>{void paste()},!clipboard)}
  {btn('Дублировать · Ctrl+D',Copy,()=>{void duplicate()},!selected.length)}
  {btn('Удалить выбранное · Delete',Trash2,()=>{void remove()},!selected.length)}
  <span className="tool-divider"/>
  {btn('Отменить · Ctrl+Z',Undo2,()=>{void undo()},!historyCount.undo)}
  {btn('Повторить · Ctrl+Y',Redo2,()=>{void redo()},!historyCount.redo)}
  <span className="tool-divider"/>
  {btn('Уменьшить масштаб',ZoomOut,()=>flow.current?.zoomOut({duration:180}))}
  {btn('Увеличить масштаб',ZoomIn,()=>flow.current?.zoomIn({duration:180}))}
  {btn('Показать всю доску',Maximize,()=>flow.current?.fitView({duration:250,padding:.15}))}
 </>;
 const context=(e:React.MouseEvent)=>{e.preventDefault();setMenu({x:Math.min(e.clientX,window.innerWidth-240),y:Math.min(e.clientY,window.innerHeight-320),pasteX:0,pasteY:0})};
 return <div className="canvas-editor" onClick={()=>menu&&setMenu(null)}>
  <div className="board-tools" role="toolbar" aria-label="Инструменты свободной доски">{actions}</div>
  <div className="board-stage" onContextMenu={context}>
   <ReactFlow<Node,Edge> nodes={renderedNodes} edges={renderedEdges} onInit={instance=>{flow.current=instance}}
    onNodesChange={onNodesChange} onNodeDragStop={onDragStop} onConnect={onConnect}
    onNodeClick={(_,n)=>{if(!selected.includes(n.id))setSelected([n.id]);setMenu(null)}}
    onSelectionChange={({nodes})=>setSelected(nodes.map(n=>n.id))}
    onNodeDoubleClick={(_,n)=>{const item=boardRef.current?.nodes.find(x=>x.id===n.id);if(!item)return;if(item.type==='TASK'){const t=tasks.find(t=>t.id===item.taskId);if(t)onEditTask(t)}else if(item.type!=='GROUP')setDialog({node:item,type:item.type})}}
    onNodeContextMenu={(e,n)=>{e.preventDefault();setSelected(old=>old.includes(n.id)?old:[n.id]);context(e)}}
    onPaneContextMenu={context} onPaneClick={()=>{setSelected([]);setMenu(null)}}
    selectionOnDrag panOnDrag={[1,2]} multiSelectionKeyCode="Shift" nodesConnectable={mode==='connect'}
    onMoveEnd={(_,v)=>setViewport(Math.round(v.zoom*100))} fitView>
     <Background gap={20} color="#cbd5e1"/><MiniMap pannable zoomable/><Controls showInteractive={false}/>
   </ReactFlow>
   <div className="board-zoom-indicator">{viewport}% {busy?' · Сохранение…':''}</div>
  </div>
  {error&&<div className="canvas-warning" role="alert">{error}<button type="button" title="Перезагрузить доску" onClick={()=>load(true)}><RotateCcw size={16}/></button></div>}
  {menu&&<div className="board-context" style={{left:menu.x,top:menu.y}} onClick={e=>e.stopPropagation()}>
   <button onClick={editSelected} disabled={selected.length!==1}><SquarePen size={15}/>Редактировать</button>
   <button onClick={copySelection} disabled={!selected.length}><Copy size={15}/>Копировать</button>
   <button onClick={()=>void paste()} disabled={!clipboard}><Clipboard size={15}/>Вставить</button>
   <button onClick={()=>void duplicate()} disabled={!selected.length}><Copy size={15}/>Дублировать</button>
   <button onClick={()=>void group()} disabled={!groupChosen}><Layers3 size={15}/>Сгруппировать</button>
   <button onClick={()=>void ungroup()} disabled={!hasGroup}><Layers2 size={15}/>Разгруппировать</button>
   <button onClick={()=>void remove()} disabled={!selected.length}><Trash2 size={15}/>Удалить</button>
  </div>}
  {dialog&&<NodeDialog key={dialog.node?.id||dialog.type} node={dialog.node} initialType={dialog.type} tasks={tasks.map(t=>({id:t.id,title:t.title}))} onClose={()=>setDialog(null)} onSave={saveNode}/>}
 </div>;
}

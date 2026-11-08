import React,{useEffect,useState} from 'react';
export type ChecklistItem={id:string;text:string;done:boolean};
export type TaskFormValue={
  title:string;description:string;priority:string;columnId:string;assigneeId:string|null;
  dueAt:string|null;checklist:ChecklistItem[];
};
export type TaskItem=TaskFormValue & {id:string;version:number;assignee?:{id:string;fullName:string}|null;_count?:{comments:number}};
type Member={userId:string;role:string;user:{fullName:string}};
type Column={id:string;name:string};
type Comment={id:string;body:string;createdAt:string;author:{fullName:string}};
type Props={task?:TaskItem|null;initialColumnId:string;columns:Column[];members:Member[];onClose:()=>void;onSave:(value:TaskFormValue)=>Promise<void>;loadComments:(id:string)=>Promise<Comment[]>;addComment:(id:string,body:string)=>Promise<Comment>};
const makeId=()=>crypto.randomUUID();
const toLocal=(iso:string|null)=>{if(!iso)return '';const d=new Date(iso);const p=(v:number)=>String(v).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;};
export default function TaskDialog({task,initialColumnId,columns,members,onClose,onSave,loadComments,addComment}:Props){
 const [title,setTitle]=useState(task?.title||'');
 const [description,setDescription]=useState(task?.description||'');
 const [priority,setPriority]=useState(task?.priority||'NORMAL');
 const [columnId,setColumnId]=useState(task?.columnId||initialColumnId);
 const [assigneeId,setAssigneeId]=useState(task?.assigneeId||'');
 const [dueAt,setDueAt]=useState(toLocal(task?.dueAt||null));
 const [checklist,setChecklist]=useState<ChecklistItem[]>(task?.checklist||[]);
 const [newItem,setNewItem]=useState('');
 const [comments,setComments]=useState<Comment[]>([]);
 const [commentText,setCommentText]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{if(!task)return;let cancelled=false;loadComments(task.id).then(c=>{if(!cancelled)setComments(c)}).catch(e=>{if(!cancelled)setError(String(e))});return()=>{cancelled=true}},[task?.id,loadComments]);
 useEffect(()=>{const handle=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose()};document.addEventListener('keydown',handle);return()=>document.removeEventListener('keydown',handle)},[busy,onClose]);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!title.trim()){setError('Укажите название задачи');return;}setBusy(true);setError('');try{await onSave({title:title.trim(),description,priority,columnId,assigneeId:assigneeId||null,dueAt:dueAt?new Date(dueAt).toISOString():null,checklist});}catch(e){setError(String(e));setBusy(false)}};
 const sendComment=async()=>{if(!task||!commentText.trim())return;setBusy(true);setError('');try{const comment=await addComment(task.id,commentText.trim());setComments(c=>[...c,comment]);setCommentText('')}catch(e){setError(String(e))}finally{setBusy(false)}};
 const addCheck=()=>{const text=newItem.trim();if(!text)return;if(checklist.length>=100){setError('Не более 100 пунктов');return;}setChecklist(items=>[...items,{id:makeId(),text,done:false}]);setNewItem('')};
 return <div className="task-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
  <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
   <div className="task-modal-header"><div><div className="task-eyebrow">ПРОЕКТ · ЗАДАЧА</div><h2 id="task-modal-title">{task?'Редактирование задачи':'Новая задача'}</h2></div><button type="button" className="task-close" onClick={onClose} aria-label="Закрыть">×</button></div>
   <form id="task-edit-form" onSubmit={submit} className="task-form">
    <label>Название задачи *<input autoFocus required maxLength={255} placeholder="Что необходимо выполнить?" value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label>Описание<textarea rows={5} maxLength={10000} placeholder="Цель, требования и ожидаемый результат…" value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <div className="task-fields">
      <label>Статус<select value={columnId} onChange={e=>setColumnId(e.target.value)}>{columns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Приоритет<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="LOW">Низкий</option><option value="NORMAL">Обычный</option><option value="HIGH">Высокий</option><option value="CRITICAL">Критический</option></select></label>
      <label>Исполнитель<select value={assigneeId} onChange={e=>setAssigneeId(e.target.value)}><option value="">Не назначен</option>{members.map(m=><option key={m.userId} value={m.userId}>{m.user.fullName}</option>)}</select></label>
      <label>Срок<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
    </div>
    <div className="task-check-heading"><strong>Чек-лист</strong><span>{checklist.filter(c=>c.done).length}/{checklist.length} выполнено</span></div>
    <div className="task-check-list">{checklist.map(item=><div className="task-check-row" key={item.id}><input aria-label="Отметить выполненным" type="checkbox" checked={item.done} onChange={e=>setChecklist(a=>a.map(c=>c.id===item.id?{...c,done:e.target.checked}:c))}/><input aria-label="Пункт чек-листа" maxLength={300} value={item.text} onChange={e=>setChecklist(a=>a.map(c=>c.id===item.id?{...c,text:e.target.value}:c))}/><button type="button" className="task-icon-button" aria-label="Удалить пункт" onClick={()=>setChecklist(a=>a.filter(c=>c.id!==item.id))}>×</button></div>)}</div>
    <div className="task-add-check"><input maxLength={300} placeholder="Новый пункт чек-листа" value={newItem} onChange={e=>setNewItem(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCheck()}}}/><button type="button" onClick={addCheck}>Добавить</button></div>
   </form>
   {task&&<div className="task-comments"><h3>Комментарии</h3>{comments.length===0?<p className="task-dim">Комментариев пока нет</p>:comments.map(c=><div className="task-comment" key={c.id}><strong>{c.author.fullName}</strong><time>{new Date(c.createdAt).toLocaleString('ru-RU')}</time><p>{c.body}</p></div>)}<div className="task-add-comment"><textarea rows={2} maxLength={5000} placeholder="Написать комментарий…" value={commentText} onChange={e=>setCommentText(e.target.value)}/><button type="button" disabled={busy||!commentText.trim()} onClick={sendComment}>Отправить</button></div></div>}
   {error&&<div className="task-error" role="alert">{error}</div>}
   <div className="task-modal-footer"><button type="button" className="task-secondary" onClick={onClose} disabled={busy}>Отмена</button><button form="task-edit-form" type="submit" disabled={busy||!title.trim()}>{busy?'Сохранение…':task?'Сохранить изменения':'Создать задачу'}</button></div>
  </section>
 </div>;
}

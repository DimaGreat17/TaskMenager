import React,{useEffect,useState} from 'react';
import {X,Save,StickyNote,Type,Square,Link2} from 'lucide-react';
type NodeType='NOTE'|'TEXT'|'SHAPE'|'TASK';
type TaskOption={id:string;title:string};
type Node={id:string;type:string;content:string;taskId?:string|null;version:number;color:string};
type Props={node?:Node|null;initialType?:NodeType;tasks:TaskOption[];onClose:()=>void;onSave:(input:{type:NodeType;content:string;taskId?:string;color?:string})=>Promise<void>};
export default function NodeDialog({node,initialType='NOTE',tasks,onClose,onSave}:Props){
 const type=(node?.type||initialType) as NodeType;
 const [content,setContent]=useState(node?.content||''),[taskId,setTaskId]=useState(node?.taskId||tasks[0]?.id||''),[color,setColor]=useState(node?.color||'#fef08a'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[onClose,busy]);
 const Icon=type==='NOTE'?StickyNote:type==='TEXT'?Type:type==='TASK'?Link2:Square;
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(type==='TASK'&&!taskId){setError('Создайте задачу в канбане или выберите существующую');return;}setBusy(true);setError('');try{await onSave({type,content,taskId:type==='TASK'?taskId:undefined,color});}catch(e){setError(String(e));setBusy(false)}};
 return <div className="task-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><section className="task-modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="node-dialog-title">
 <div className="task-modal-header"><div><div className="task-eyebrow">ВИЗУАЛЬНАЯ ДОСКА</div><h2 id="node-dialog-title"><Icon size={22}/>{node?'Изменить блок':'Добавить блок'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Закрыть" title="Закрыть"><X size={18}/></button></div>
 <form id="node-form" className="task-form" onSubmit={submit}>
 {type==='TASK'?<label>Задача<select value={taskId} onChange={e=>setTaskId(e.target.value)} required><option value="">Выберите задачу</option>{tasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>:<label>Содержимое<textarea rows={5} maxLength={5000} autoFocus placeholder="Введите текст блока..." value={content} onChange={e=>setContent(e.target.value)}/></label>}
 {type!=='TASK'&&<label>Цвет блока<input type="color" className="color-input" value={color} onChange={e=>setColor(e.target.value)}/></label>}
 </form>{error&&<p className="task-error">{error}</p>}
 <div className="task-modal-footer"><button className="btn-secondary" onClick={onClose} disabled={busy}>Отмена</button><button className="btn-primary" form="node-form" disabled={busy}><Save size={16}/>{busy?'Сохранение…':'Сохранить'}</button></div>
 </section></div>;
}

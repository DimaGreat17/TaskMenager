import React,{useEffect,useState} from 'react';
import {X,FolderPlus,Save} from 'lucide-react';
type Props={onClose:()=>void;onSave:(value:{name:string;code:string;description:string})=>Promise<void>};
export default function ProjectDialog({onClose,onSave}:Props){
 const [name,setName]=useState(''),[code,setCode]=useState(''),[description,setDescription]=useState(''),[manual,setManual]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[busy,onClose]);
 const updateName=(next:string)=>{setName(next);if(!manual)setCode(next.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,24))};
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(name.trim().length<2||!/^[A-Z0-9_-]{2,24}$/.test(code)){setError('Название — от 2 символов, код — от 2 до 24 латинских букв, цифр, _ или -');return;}setError('');setBusy(true);try{await onSave({name:name.trim(),code,description});}catch(e){setError(String(e));setBusy(false)}};
 return <div className="task-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><section className="task-modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
 <div className="task-modal-header"><div><div className="task-eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</div><h2 id="project-dialog-title"><FolderPlus size={22}/> Новый проект</h2></div><button className="icon-button" title="Закрыть" aria-label="Закрыть" onClick={onClose}><X size={18}/></button></div>
 <form id="project-form" className="task-form" onSubmit={submit}>
  <label>Название проекта<input autoFocus required minLength={2} maxLength={200} value={name} onChange={e=>updateName(e.target.value)} placeholder="Например, Разработка сайта"/></label>
  <label>Код проекта<input required minLength={2} maxLength={24} value={code} onChange={e=>{setManual(true);setCode(e.target.value.toUpperCase())}} placeholder="WEBSITE"/><small className="field-hint">Уникальный код из латинских букв, цифр, _ и -</small></label>
  <label>Описание<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={3000} rows={4} placeholder="Цели и краткое описание проекта"/></label>
 </form>{error&&<p className="task-error">{error}</p>}
 <div className="task-modal-footer"><button className="btn-secondary" onClick={onClose} disabled={busy}>Отмена</button><button form="project-form" disabled={busy} className="btn-primary"><Save size={16}/>{busy?'Создание…':'Создать проект'}</button></div>
 </section></div>;
}

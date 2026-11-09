import React,{useEffect,useMemo,useRef,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Clock3,X} from 'lucide-react';
type Props={value:string;onChange:(value:string)=>void;disabled?:boolean};
const pad=(n:number)=>String(n).padStart(2,'0');
const dayString=(d:Date)=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
const parse=(s:string)=>{const [y,m,d]=s.split('-').map(Number);return y&&m&&d?new Date(y,m-1,d):new Date()};
const monthFormat=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'});
const weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
export default function DeadlinePicker({value,onChange,disabled=false}:Props){
 const root=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false);
 const [month,setMonth]=useState(()=>{const d=value?parse(value.slice(0,10)):new Date();return new Date(d.getFullYear(),d.getMonth(),1)});
 const day=value.slice(0,10);
 const time=value.slice(11,16)||'09:00';
 const dates=useMemo(()=>{
  const offset=(month.getDay()+6)%7;
  const first=new Date(month.getFullYear(),month.getMonth(),1-offset);
  return Array.from({length:42},(_,i)=>new Date(first.getFullYear(),first.getMonth(),first.getDate()+i));
 },[month]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false)};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();setOpen(false)}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true)};
 },[open]);
 const choose=(d:Date)=>{onChange(dayString(d)+'T'+time);setOpen(false)};
 const today=()=>{const d=new Date();onChange(dayString(d)+'T'+time);setMonth(new Date(d.getFullYear(),d.getMonth(),1));setOpen(false)};
 return <div className="deadline-picker" ref={root}>
  <div className="deadline-fields">
   <button type="button" disabled={disabled} className="deadline-date-trigger" onClick={()=>{if(!open&&day){const d=parse(day);setMonth(new Date(d.getFullYear(),d.getMonth(),1))}setOpen(!open)}} aria-expanded={open} aria-label="Выбрать дату срока"><CalendarDays size={17}/><span>{day?parse(day).toLocaleDateString('ru-RU'):'Выбрать дату'}</span></button>
   <div className="deadline-time"><Clock3 size={16}/><input type="time" aria-label="Время срока" value={time} disabled={disabled||!day} onChange={e=>{if(day&&e.target.value)onChange(day+'T'+e.target.value)}}/></div>
   {day&&<button type="button" className="deadline-clear" title="Очистить срок" aria-label="Очистить срок" onClick={()=>{onChange('');setOpen(false)}}><X size={16}/></button>}
  </div>
  {open&&<div className="deadline-popover" role="group" aria-label="Календарь срока">
   <div className="deadline-month"><strong>{monthFormat.format(month)}</strong><div>
    <button type="button" title="Предыдущий месяц" aria-label="Предыдущий месяц" onClick={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))}><ChevronLeft size={18}/></button>
    <button type="button" title="Следующий месяц" aria-label="Следующий месяц" onClick={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))}><ChevronRight size={18}/></button>
   </div></div>
   <div className="deadline-grid">
    {weekdays.map(w=><span className="deadline-weekday" key={w}>{w}</span>)}
    {dates.map(d=>{
     const date=dayString(d);
     const className='deadline-day'+(d.getMonth()!==month.getMonth()?' other-month':'')+(date===dayString(new Date())?' today':'')+(date===day?' selected':'');
     return <button key={date} type="button" className={className} aria-label={d.toLocaleDateString('ru-RU')} aria-pressed={date===day} onClick={()=>choose(d)}>{d.getDate()}</button>;
    })}
   </div>
   <div className="deadline-actions"><button type="button" onClick={()=>{onChange('');setOpen(false)}}>Очистить</button><button type="button" onClick={today}>Сегодня</button></div>
  </div>}
 </div>;
}

import { T, DAYS, ROLE_COLOR_PALETTE, DEFAULT_ROLE_STYLES, isDark } from '../../lib/constants';
import { blockHours } from '../../lib/schedule';
import { Btn, SectionLabel, AddRoleInline } from '../ui';

export default function CoverageView({
  allRoles, roleStyles, setRoleStyles,
  editingRole, setEditingRole, confirmDelete, setConfirmDelete,
  setEmployees, blocks, setBlocks,
  s, t,
}){
  return (<div style={{display:'flex',flexDirection:'column',gap:12}}>
    <div style={s.card}>
      <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:4}}>{t('cov.roles')}</div>
      <div style={{fontSize:12,color:T.text2,marginBottom:14}}>{t('cov.rolesDesc')}</div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {allRoles.map(role=>{
          const rs=roleStyles[role]||DEFAULT_ROLE_STYLES.Other,isProtected=role==='Manager',isEditing=editingRole?.name===role,isDeleting=confirmDelete===role;
          if(isEditing)return(<div key={role} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',padding:'10px 12px',borderRadius:10,background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
            <input autoFocus value={editingRole.newName} onChange={e=>setEditingRole(p=>({...p,newName:e.target.value}))} style={{...s.input,width:130,flex:'0 0 auto'}}/>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{ROLE_COLOR_PALETTE.map((p,i)=><button key={i} onClick={()=>setEditingRole(p=>({...p,colorIdx:i}))} style={{width:20,height:20,borderRadius:'50%',background:p.dot,border:editingRole.colorIdx===i?`2px solid ${T.text}`:'2px solid transparent',cursor:'pointer',padding:0}}/>)}</div>
            <div style={{display:'flex',gap:6,marginLeft:'auto'}}>
              <Btn small onClick={()=>{const{name,newName,colorIdx}=editingRole;if(!newName.trim())return;const ns=ROLE_COLOR_PALETTE[colorIdx];if(newName!==name){setRoleStyles(p=>{const n={...p};delete n[name];return{...n,[newName]:ns};});setEmployees(p=>p.map(e=>({...e,roles:(e.roles||[]).map(r=>r===name?newName:r)})));setBlocks(p=>p.map(b=>{const nr={...b.roles};const val=nr[name]||0;delete nr[name];return{...b,roles:{...nr,[newName]:val}};}));}else{setRoleStyles(p=>({...p,[name]:ns}));}setEditingRole(null);}}>{t('common.save')}</Btn>
              <Btn small variant="ghost" onClick={()=>setEditingRole(null)}>{t('common.cancel')}</Btn>
            </div>
          </div>);
          if(isDeleting)return(<div key={role} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,background:T.dangerLight,border:`1px solid ${T.danger}33`}}>
            <span style={{fontSize:12,color:T.danger,flex:1}}>{t('cov.removeRolePre')}<b>{role}</b>{t('cov.removeRolePost')}</span>
            <Btn small variant="danger" onClick={()=>{setRoleStyles(p=>{const n={...p};delete n[role];return n;});setEmployees(p=>p.map(e=>({...e,roles:(e.roles||[]).filter(r=>r!==role)})));setBlocks(p=>p.map(b=>{const nr={...b.roles};delete nr[role];return{...b,roles:nr};}));setConfirmDelete(null);}}>{t('cov.yesRemove')}</Btn>
            <Btn small variant="ghost" onClick={()=>setConfirmDelete(null)}>{t('common.cancel')}</Btn>
          </div>);
          return(<div key={role} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:10,background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:rs.dot,flexShrink:0}}/>
            <span style={{fontSize:13,fontWeight:500,color:T.text,flex:1}}>{role}</span>
            {isProtected&&<span style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>{t('cov.protected')}</span>}
            {!isProtected&&<div style={{display:'flex',gap:4}}><Btn small variant="ghost" onClick={()=>{const ci=ROLE_COLOR_PALETTE.findIndex(p=>p.dot===rs.dot);setEditingRole({name:role,newName:role,colorIdx:ci>=0?ci:0});}}>{t('common.edit')}</Btn><Btn small variant="danger" onClick={()=>setConfirmDelete(role)}>{t('common.remove')}</Btn></div>}
            {isProtected&&<Btn small variant="ghost" onClick={()=>{const ci=ROLE_COLOR_PALETTE.findIndex(p=>p.dot===rs.dot);setEditingRole({name:role,newName:role,colorIdx:ci>=0?ci:0});}}>{t('cov.editColour')}</Btn>}
          </div>);
        })}
        <AddRoleInline t={t} onAdd={name=>{if(!name.trim()||roleStyles[name])return;const idx=Object.keys(roleStyles).length%ROLE_COLOR_PALETTE.length;setRoleStyles(p=>({...p,[name]:ROLE_COLOR_PALETTE[idx]}));}}/>
      </div>
    </div>
    <div style={{fontSize:13,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px 16px'}}>{t('cov.blocksDesc')}</div>
    {blocks.map(block=>{
      const overrides=block.overrides||{},daysWithOverride=DAYS.filter(d=>overrides[d]);
      const updDefRole=(role,val)=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,roles:{...b.roles,[role]:Math.max(0,Number(val))}}:b));
      const updOvRole=(day,role,val)=>setBlocks(p=>p.map(b=>{if(b.id!==block.id)return b;const ov={...b.overrides||{}};ov[day]={...(ov[day]||{...b.roles}),[role]:Math.max(0,Number(val))};return{...b,overrides:ov};}));
      const addDayOv=day=>setBlocks(p=>p.map(b=>{if(b.id!==block.id)return b;const ov={...b.overrides||{}};ov[day]={...b.roles};return{...b,overrides:ov};}));
      const remDayOv=day=>setBlocks(p=>p.map(b=>{if(b.id!==block.id)return b;const ov={...b.overrides||{}};delete ov[day];return{...b,overrides:Object.keys(ov).length?ov:undefined};}));
      return(<div key={block.id} style={s.card}>
        <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'flex-end'}}>
          <div style={{flex:'2 1 100px'}}><SectionLabel>{t('cov.blockName')}</SectionLabel><input value={block.name} onChange={e=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,name:e.target.value}:b))} style={s.input}/></div>
          <div style={{flex:'1 1 80px'}}><SectionLabel>{t('cov.start')}</SectionLabel><input type="time" value={block.start} onChange={e=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,start:e.target.value}:b))} style={s.input}/></div>
          <div style={{flex:'1 1 80px'}}><SectionLabel>{t('cov.end')}</SectionLabel><input type="time" value={block.end} onChange={e=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,end:e.target.value}:b))} style={s.input}/></div>
          <div style={{flex:'0 0 auto'}}><SectionLabel>{t('cov.duration')}</SectionLabel><div style={{fontSize:13,color:T.text2,padding:'7px 0'}}>{blockHours(block).toFixed(1)}h</div></div>
          <Btn onClick={()=>setBlocks(p=>p.filter(b=>b.id!==block.id))} variant="danger" small>{t('common.remove')}</Btn>
        </div>
        <SectionLabel>{t('cov.defaultStaffing')}</SectionLabel>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6,marginBottom:16}}>
          {allRoles.map(role=>{const rs=roleStyles[role]||DEFAULT_ROLE_STYLES.Other;return(<div key={role} style={{display:'flex',alignItems:'center',gap:6,background:isDark()?rs.dot+'30':rs.bg,border:`1px solid ${isDark()?rs.dot+'80':rs.border}`,borderRadius:8,padding:'6px 10px'}}>
            <span style={{fontSize:11,fontWeight:500,color:isDark()?rs.dot:rs.text}}>{role}</span>
            <input type="number" min="0" max="99" value={block.roles[role]||0} onChange={e=>updDefRole(role,e.target.value)} style={{width:36,textAlign:'center',padding:'3px 4px',fontSize:12,borderRadius:5,border:`1px solid ${rs.border}`,background:isDark()?'rgba(255,255,255,0.08)':'rgba(255,255,255,0.6)',color:isDark()?rs.dot:rs.text,fontFamily:'inherit'}}/>
          </div>);})}
        </div>
        <SectionLabel>{t('cov.dayOverrides')}</SectionLabel>
        <div style={{marginTop:6,display:'flex',flexDirection:'column',gap:8}}>
          {daysWithOverride.map(day=>{const dr=overrides[day];return(<div key={day} style={{background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><span style={{fontSize:12,fontWeight:600,color:T.text,width:36}}>{t('day.'+day)}</span><span style={{fontSize:11,color:T.text3,flex:1}}>{t('cov.customStaffing',{day:t('day.'+day)})}</span><Btn small variant="ghost" onClick={()=>remDayOv(day)}>{t('cov.removeX')}</Btn></div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{allRoles.map(role=>{const rs=roleStyles[role]||DEFAULT_ROLE_STYLES.Other,isChanged=(dr[role]||0)!==(block.roles[role]||0);return(<div key={role} style={{display:'flex',alignItems:'center',gap:6,background:isDark()?rs.dot+'30':rs.bg,border:`1.5px solid ${isChanged?rs.dot:isDark()?rs.dot+'80':rs.border}`,borderRadius:8,padding:'6px 10px'}}><span style={{fontSize:11,fontWeight:500,color:isDark()?rs.dot:rs.text}}>{role}</span><input type="number" min="0" max="99" value={dr[role]||0} onChange={e=>updOvRole(day,role,e.target.value)} style={{width:36,textAlign:'center',padding:'3px 4px',fontSize:12,borderRadius:5,border:`1px solid ${rs.border}`,background:isDark()?'rgba(255,255,255,0.08)':'rgba(255,255,255,0.6)',color:isDark()?rs.dot:rs.text,fontFamily:'inherit'}}/>{isChanged&&<span style={{fontSize:9,color:rs.dot,fontWeight:600}}>↑</span>}</div>);})}
            </div>
          </div>);})}
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}><span style={{fontSize:11,color:T.text3}}>{t('cov.addOverrideFor')}</span>
            {DAYS.filter(d=>!overrides[d]).map(day=><button key={day} onClick={()=>addDayOv(day)} style={{padding:'3px 10px',borderRadius:999,fontSize:11,fontWeight:500,cursor:'pointer',background:'transparent',border:`1px dashed ${T.border}`,color:T.text2,fontFamily:'inherit'}} onMouseEnter={e=>{e.target.style.borderColor=T.accent;e.target.style.color=T.accent;}} onMouseLeave={e=>{e.target.style.borderColor=T.border;e.target.style.color=T.text2;}}>{'+ '+t('day.'+day)}</button>)}
            {DAYS.every(d=>overrides[d])&&<span style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>{t('cov.allDaysCustom')}</span>}
          </div>
        </div>
      </div>);
    })}
    <div><Btn onClick={()=>setBlocks(p=>[...p,{id:crypto.randomUUID(),name:'New Block',start:'09:00',end:'17:00',roles:Object.fromEntries(allRoles.map(r=>[r,0]))}])} variant="secondary">{t('cov.addBlock')}</Btn></div>
  </div>);
}

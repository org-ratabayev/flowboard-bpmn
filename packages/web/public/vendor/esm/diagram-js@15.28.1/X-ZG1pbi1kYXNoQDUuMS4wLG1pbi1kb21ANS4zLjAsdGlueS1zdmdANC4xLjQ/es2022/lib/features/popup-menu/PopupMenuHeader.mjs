/* esm.sh - diagram-js@15.28.1/lib/features/popup-menu/PopupMenuHeader */
import r from"../../../../../../clsx@2.1.1__784fb815.mjs";import{html as o,useMemo as m}from"../../ui/index.mjs";function b(a){let{headerEntries:s,onSelect:u,selectedEntry:t,setSelectedEntry:i,title:c}=a,p=m(()=>f(s),[s]),d=l=>l.action&&!l.disabled,n=(l,e)=>{if(d(e))return u(l,e)};return o`
    <div class="djs-popup-header">
      <h3 class="djs-popup-title" title=${c}>${c}</h3>
      ${p.map(l=>o`
        <ul key=${l.id} class="djs-popup-header-group" data-header-group=${l.id}>

          ${l.entries.map(e=>o`
            <li key=${e.id}>
              <${d(e)?"button":"span"}
                class=${h(e,e===t)}
                onClick=${$=>n($,e)}
                title=${e.title||e.label}
                data-id=${e.id}
                aria-disabled=${e.disabled||void 0}
                onMouseEnter=${()=>d(e)&&i(e)}
                onMouseLeave=${()=>d(e)&&i(null)}
                onFocus=${()=>d(e)&&i(e)}
                onBlur=${()=>d(e)&&i(null)}
              >
                ${e.imageUrl&&o`<img class="djs-popup-entry-icon" src=${e.imageUrl} alt="" />`||e.imageHtml&&o`<div class="djs-popup-entry-icon" dangerouslySetInnerHTML=${{__html:e.imageHtml}} />`}
                ${e.label?o`
                  <span class="djs-popup-label">${e.label}</span>
                `:null}
              </${e.action?"button":"span"}>
            </li>
          `)}
        </ul>
      `)}
    </div>
  `}function f(a){return a.reduce((s,u)=>{let t=u.group||"default",i=s.find(c=>c.id===t);return i?i.entries.push(u):s.push({id:t,entries:[u]}),s},[])}function h(a,s){return r("entry",a.className,a.active?"active":"",a.disabled?"disabled":"",s?"selected":"")}export{b as default};
//# sourceMappingURL=PopupMenuHeader.mjs.map
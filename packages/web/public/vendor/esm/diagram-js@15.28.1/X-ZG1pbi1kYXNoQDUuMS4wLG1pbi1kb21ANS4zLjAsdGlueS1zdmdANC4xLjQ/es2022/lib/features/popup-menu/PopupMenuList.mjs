/* esm.sh - diagram-js@15.28.1/lib/features/popup-menu/PopupMenuList */
import{html as s,useLayoutEffect as y,useRef as h}from"../../ui/index.mjs";import x from"./PopupMenuItem.mjs";function P(n){let{selectedEntry:o,setSelectedEntry:i,groupedEntries:c,keyboardSelection:r,onPointerInteraction:u,idPrefix:d,id:f,ariaLabel:$,tabIndex:p,ariaActivedescendant:M,...m}=n,l=h();y(()=>{if(!r||!r.current)return;let e=l.current;if(!e)return;let t=e.querySelector(".selected");t&&L(t)},[o]);let v=()=>{r.current=!1,u()},E=e=>{e!==o&&i(e)},I=e=>{r.current||i(e)},b=()=>{r.current||i(null)};return s`
    <div
      class="djs-popup-results"
      ref=${l}
      id=${f}
      role="listbox"
      aria-label=${$}
      tabIndex=${p}
      aria-activedescendant=${M}
      onMouseMove=${v}
    >
      ${c.map(e=>s`
        ${e.name&&s`
          <div key=${e.id} id=${a(d,e)} class="entry-header" title=${e.name}>
            ${e.name}
          </div>
        `}
        <ul
          class="djs-popup-group"
          data-group=${e.id}
          role="group"
          aria-labelledby=${e.name?a(d,e):void 0}
        >
          ${e.entries.map(t=>s`
            <${x}
              key=${t.id}
              idPrefix=${d}
              entry=${t}
              selected=${t===o}
              onMouseEnter=${()=>I(t)}
              onMouseMove=${()=>E(t)}
              onMouseLeave=${b}
              ...${m}
            />
          `)}
        </ul>
      `)}
    </div>
  `}function a(n,o){return`${n}-group-${o.id}`}function L(n){typeof n.scrollIntoViewIfNeeded=="function"?n.scrollIntoViewIfNeeded():n.scrollIntoView({scrollMode:"if-needed",block:"nearest"})}export{P as default};
//# sourceMappingURL=PopupMenuList.mjs.map
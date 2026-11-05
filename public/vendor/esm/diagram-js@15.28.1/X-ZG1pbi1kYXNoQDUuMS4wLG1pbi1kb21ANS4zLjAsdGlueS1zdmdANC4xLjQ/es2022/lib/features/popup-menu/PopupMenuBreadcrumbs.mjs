/* esm.sh - diagram-js@15.28.1/lib/features/popup-menu/PopupMenuBreadcrumbs */
import{html as l,useMemo as i}from"../../ui/index.mjs";function c(o){let{navigationStack:e,setNavigationStack:a}=o,p=i(()=>e.length<=1?[]:e.slice(0,-1).map((t,s)=>({label:t.label,onClick:()=>a(u=>u.slice(0,s+1))})),[e,a]),r=e.length>0?()=>a([]):null,n=e.length>0?e[e.length-1].label:null;return l`
    <div class="djs-popup-breadcrumbs">
      ${r&&l`
        <button
          type="button"
          class="djs-popup-breadcrumbs-item djs-popup-breadcrumbs-item--back"
          title="Back"
          aria-label="Back"
          onClick=${r}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M8.03033 1.46967C8.32322 1.76256 8.32322 2.23744 8.03033 2.53033L4.56066 6L8.03033 9.46967C8.32322 9.76256 8.32322 10.2374 8.03033 10.5303C7.73744 10.8232 7.26256 10.8232 6.96967 10.5303L2.96967 6.53033C2.67678 6.23744 2.67678 5.76256 2.96967 5.46967L6.96967 1.46967C7.26256 1.17678 7.73744 1.17678 8.03033 1.46967Z" fill="currentColor"/>
          </svg>
        </button>
      `}
      ${p.map((t,s)=>l`
        <button
          key=${s}
          type="button"
          class="djs-popup-breadcrumbs-item"
          onClick=${t.onClick}
          title=${t.label}
        >
          ${t.label}
        </button>
        <span class="djs-popup-breadcrumbs-item--separator" aria-hidden="true"></span>
      `)}
      ${n&&l`
        <span class="djs-popup-breadcrumbs-item djs-popup-breadcrumbs-item--current" title=${n}>
          ${n}
        </span>
      `}
    </div>
  `}export{c as default};
//# sourceMappingURL=PopupMenuBreadcrumbs.mjs.map
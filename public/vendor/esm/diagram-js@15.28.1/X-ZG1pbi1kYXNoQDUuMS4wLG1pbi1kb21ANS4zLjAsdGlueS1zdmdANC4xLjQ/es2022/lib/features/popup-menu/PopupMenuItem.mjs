/* esm.sh - diagram-js@15.28.1/lib/features/popup-menu/PopupMenuItem */
import d from"../../../../../../clsx@2.1.1__784fb815.mjs";import{html as n}from"../../ui/index.mjs";function g(o,i){return`${o}-entry-${i.id}`}function m(o){let{idPrefix:i,entry:e,selected:s,onMouseEnter:l,onMouseMove:p,onMouseLeave:u,onAction:c}=o,a=(t,$)=>{if(!e.disabled)return c(t,e,$)},r=!e.entries;return n`
    <li
      class=${d("entry",{selected:s,disabled:e.disabled})}
      data-id=${e.id}
      id=${g(i,e)}
      role="option"
      aria-selected=${s||void 0}
      aria-haspopup=${e.entries?"true":void 0}
      title=${e.title}
      aria-disabled=${e.disabled||void 0}
      onClick=${a}
      onMouseEnter=${l}
      onMouseMove=${p}
      onMouseLeave=${u}
      onDragStart=${t=>r&&a(t,"dragstart")}
      draggable=${r}
    >
      <div class="djs-popup-entry-content">
        <span
          class=${d("djs-popup-entry-name",e.className)}
        >
          ${e.imageUrl&&n`<img class="djs-popup-entry-icon" src=${e.imageUrl} alt="" />`||e.imageHtml&&n`<div class="djs-popup-entry-icon" dangerouslySetInnerHTML=${{__html:e.imageHtml}} />`}

          ${e.label?n`
            <span class="djs-popup-label">
              ${e.label}
            </span>
          `:null}
        </span>
        ${e.description&&n`
          <span
            class="djs-popup-entry-description"
          >
            ${e.description}
          </span>
        `}
      </div>
      ${(e.documentationRef||e.entries)&&n`
        <div class="djs-popup-entry-actions">
          ${e.documentationRef&&n`
            <a
              class="djs-popup-entry-docs"
              href=${e.documentationRef}
              onClick=${t=>t.stopPropagation()}
              title="Open entry documentation"
              tabIndex="-1"
              aria-hidden="true"
              target="_blank"
              rel="noopener"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M10.6368 10.6375V5.91761H11.9995V10.6382C11.9995 10.9973 11.8623 11.3141 11.5878 11.5885C11.3134 11.863 10.9966 12.0002 10.6375 12.0002H1.36266C0.982345 12.0002 0.660159 11.8681 0.396102 11.6041C0.132044 11.34 1.52588e-05 11.0178 1.52588e-05 10.6375V1.36267C1.52588e-05 0.98236 0.132044 0.660173 0.396102 0.396116C0.660159 0.132058 0.982345 2.95639e-05 1.36266 2.95639e-05H5.91624V1.36267H1.36266V10.6375H10.6368ZM12 0H7.2794L7.27873 1.36197H9.68701L3.06507 7.98391L4.01541 8.93425L10.6373 2.31231V4.72059H12V0Z" fill="currentColor"/>
              </svg>
            </a>
          `}
          ${e.entries&&n`
            <div class="djs-popup-entry-chevron" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M3.96967 1.46967C4.26256 1.17678 4.73744 1.17678 5.03033 1.46967L9.03033 5.46967C9.32322 5.76256 9.32322 6.23744 9.03033 6.53033L5.03033 10.5303C4.73744 10.8232 4.26256 10.8232 3.96967 10.5303C3.67678 10.2374 3.67678 9.76256 3.96967 9.46967L7.43934 6L3.96967 2.53033C3.67678 2.23744 3.67678 1.76256 3.96967 1.46967Z" fill="currentColor"/>
              </svg>
            </div>
          `}
        </div>
      `}
    </li>
  `}export{m as default,g as getPopupMenuItemId};
//# sourceMappingURL=PopupMenuItem.mjs.map
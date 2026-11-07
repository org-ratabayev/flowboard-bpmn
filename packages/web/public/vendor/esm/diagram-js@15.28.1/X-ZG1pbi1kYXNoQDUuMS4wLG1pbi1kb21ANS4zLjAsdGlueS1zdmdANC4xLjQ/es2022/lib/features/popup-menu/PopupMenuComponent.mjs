/* esm.sh - diagram-js@15.28.1/lib/features/popup-menu/PopupMenuComponent */
import{useEffect as O,useRef as R,useState as j,useLayoutEffect as q,html as h,useMemo as D,useCallback as u}from"../../ui/index.mjs";import{closest as W,matches as ae}from"../../../../../../min-dom@5.3.0/X-ZG1pbi1kYXNoQDUuMS4w/es2022/min-dom.mjs";import ve from"./PopupMenuBreadcrumbs.mjs";import ke from"./PopupMenuHeader.mjs";import Ce from"./PopupMenuList.mjs";import{getPopupMenuItemId as xe}from"./PopupMenuItem.mjs";import Se from"../../util/IdGenerator.mjs";import Le from"../../../../../../clsx@2.1.1__784fb815.mjs";import{isDefined as ee,isFunction as Ie}from"../../../../../../min-dash@5.1.0/es2022/min-dash.mjs";var Me=new Se("djs-popup");function je(l){let{onClose:s,onSelect:c,className:b,headerEntries:$,position:a,title:p,width:Z,scale:G,search:S,emptyPlaceholder:m,searchFn:P,entries:o,onOpened:y,onClosed:L,defaultTab:w}=l,[f,V]=j([]);O(()=>{V([]),U(null)},[o]);let d=D(()=>{let e=[],t=new Set,n=!1;return o.forEach(({tab:r})=>{if(!r){n=!0;return}t.has(r.id)||(t.add(r.id),e.push(r))}),e.length?n&&!w?[]:n?[w,...e.filter(r=>r.id!==w.id)]:e:[]},[o,w]),[te,U]=j(null),E=d.some(e=>e.id===te)?te:d.length?d[0].id:null,I=R();q(()=>{let e=I.current;if(!e)return;let t=e.querySelector('[aria-selected="true"]');t&&ce(t)},[E]);let[ne,ue]=j({start:!1,end:!1}),v=u(()=>{let{scrollLeft:e,scrollWidth:t,clientWidth:n}=I.current;ue({start:e>0,end:t-n-e>1})},[]),F=u(e=>{let t=I.current,n=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(!n)return;let{scrollLeft:r,scrollWidth:x,clientWidth:k}=t;x-k<1||(e.preventDefault(),t.scrollLeft=r+n,v())},[v]);q(()=>{let e=I.current;if(e)return v(),e.addEventListener("scroll",v),e.addEventListener("wheel",F,{passive:!1}),()=>{e.removeEventListener("scroll",v),e.removeEventListener("wheel",F)}},[d,E,v,F]);let pe=u(e=>{let t=I.current,n=e>0?[...t.children]:[...t.children].reverse(),r=t.getBoundingClientRect(),x=n.find(k=>{let K=k.getBoundingClientRect();return e>0?K.right>r.right+1:K.left<r.left-1});x&&(ce(x),v())},[v]),re=u(e=>e.tab&&e.tab.id||w&&w.id,[w]),[H,oe]=j(""),C=H.trim().length>0,N=D(()=>Te(o),[o]),A=D(()=>ee(S)?N.length>5:!1,[S,N]),g=D(()=>{let e=f.length?f[f.length-1].entries:d.length>1?o.filter(t=>re(t)===E):o;return A?C?P(N.filter(({searchable:t})=>t!==!1),H,{keys:["label","search","description"]}).map(({item:t})=>t):e.filter(({rank:t=0})=>t>=0):e},[A,C,N,H,P,f,o,d,E,re]),X=D(()=>C?g.length?[{id:"default",entries:g}]:[]:Ke(g),[g,C]),[i,T]=j(g[0]),Y=R(null),B=R(!1),[fe,se]=j("keyboard"),he=u(()=>{se("keyboard")},[]),ge=u(()=>{se("pointer")},[]),z=D(()=>Me.next(),[]),_=`${z}-results`,ie=i&&xe(z,i);O(()=>{let e=Y.current;e&&g.includes(e)?T(e):T(g[0]),Y.current=null},[g]);let J=u(e=>{let t=Ae(X),r=t.indexOf(i)+e;r<0&&(r=t.length-1),r>=t.length&&(r=0),B.current=!0,T(t[r])},[X,i]),M=u(e=>{e>0&&i&&i.entries&&(B.current=!0,V(t=>[...t,i])),e<0&&f.length>0&&(B.current=!0,Y.current=f[f.length+e],V(t=>t.slice(0,e)))},[i,f]),Q=u((e,t,n)=>{if(!(!t||t.disabled))return t.entries?(e.preventDefault(),M(1)):c(e,t,n)},[c,M]),$e=u(e=>{if(e.key==="Enter"&&i){let t=e.target;return!!W(t,"a, button",!0)||i.disabled?void 0:Q(e,i)}if(e.key==="Backspace"){let t=e.target;if(!(ae(t,"input")&&t.value!==""))return M(-1),e.preventDefault()}if(e.key==="ArrowUp")return J(-1),e.preventDefault();if(e.key==="ArrowDown")return J(1),e.preventDefault();if(e.key==="ArrowRight")return M(1),e.preventDefault();if(e.key==="ArrowLeft")return M(-1),e.preventDefault()},[i,J,M,Q]),be=u((e,t)=>{if(U(t),!e.detail)return;let n=W(e.currentTarget,".djs-popup",!0),r=n&&n.querySelector("input");r&&r.focus()},[]),me=u(e=>{if(e.key==="Enter"||e.key===" "){e.stopPropagation();return}if(e.key==="ArrowDown"||e.key==="ArrowUp"){let k=W(e.currentTarget,".djs-popup",!0),K=k.querySelector("input")||k.querySelector('[role="listbox"]');K&&K.focus();return}let t=d.findIndex(k=>k.id===E),n;if(e.key==="ArrowLeft")n=(t-1+d.length)%d.length;else if(e.key==="ArrowRight")n=(t+1)%d.length;else if(e.key==="Home")n=0;else if(e.key==="End")n=d.length-1;else return;e.preventDefault(),e.stopPropagation(),U(d[n].id);let r=e.currentTarget.parentNode,x=r&&r.children[n];x&&x.focus()},[d,E]),ye=u(e=>{ae(e.target,"input")&&oe(()=>e.target.value)},[oe]);O(()=>(y(),()=>{L()}),[]);let le=!C&&f.length>0,we=d.length>1&&!C&&f.length===0,Ee=(p||$.length>0)&&!le;return h`
    <${de}
      onClose=${s}
      onKeyup=${ye}
      onKeydown=${$e}
      className=${b}
      position=${a}
      width=${Z}
      scale=${G}
      navigationStack=${f}
      interactionMode=${fe}
      onKeyboardInteraction=${he}
    >
      ${Ee&&h`
        <${ke}
          headerEntries=${$}
          onSelect=${c}
          selectedEntry=${i}
          setSelectedEntry=${T}
          title=${p}
        />
      `}
      ${le&&h`
        <${ve}
          navigationStack=${f}
          setNavigationStack=${V}
        />
      `}
      ${o.length>0&&h`
        <div class="djs-popup-body">

          ${A&&h`
          <div class="djs-popup-search">
            <svg class="djs-popup-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M9.0325 8.5H9.625L13.3675 12.25L12.25 13.3675L8.5 9.625V9.0325L8.2975 8.8225C7.4425 9.5575 6.3325 10 5.125 10C2.4325 10 0.25 7.8175 0.25 5.125C0.25 2.4325 2.4325 0.25 5.125 0.25C7.8175 0.25 10 2.4325 10 5.125C10 6.3325 9.5575 7.4425 8.8225 8.2975L9.0325 8.5ZM1.75 5.125C1.75 6.9925 3.2575 8.5 5.125 8.5C6.9925 8.5 8.5 6.9925 8.5 5.125C8.5 3.2575 6.9925 1.75 5.125 1.75C3.2575 1.75 1.75 3.2575 1.75 5.125Z" fill="#22242A"/>
            </svg>
            <input
              type="text"
              spellcheck=${!1}
              role="combobox"
              aria-label="${p||"Search"}"
              aria-expanded="true"
              aria-controls=${_}
              aria-activedescendant=${ie||void 0}
              aria-autocomplete="list"
            />
          </div>
          `}

          ${we&&h`
            <div class="djs-popup-tabs-container">
              <div class="djs-popup-tabs" ref=${I} role="tablist">
                ${d.map(e=>h`
                  <button
                    type="button"
                    class="djs-popup-tab"
                    role="tab"
                    title=${e.title||void 0}
                    aria-controls=${_}
                    aria-selected=${e.id===E}
                    tabIndex=${e.id===E?0:-1}
                    onClick=${t=>be(t,e.id)}
                    onKeydown=${me}
                  >${e.label}</button>
                `)}
              </div>

              ${""}
              ${[-1,1].map(e=>(e<0?ne.start:ne.end)&&h`
                <button
                  type="button"
                  class=${`djs-popup-tabs-scroll djs-popup-tabs-scroll-${e<0?"start":"end"}`}
                  aria-hidden="true"
                  tabIndex="-1"
                  onMousedown=${t=>t.preventDefault()}
                  onClick=${()=>pe(e)}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M3.96967 1.46967C4.26256 1.17678 4.73744 1.17678 5.03033 1.46967L9.03033 5.46967C9.32322 5.76256 9.32322 6.23744 9.03033 6.53033L5.03033 10.5303C4.73744 10.8232 4.26256 10.8232 3.96967 10.5303C3.67678 10.2374 3.67678 9.76256 3.96967 9.46967L7.43934 6L3.96967 2.53033C3.67678 2.23744 3.67678 1.76256 3.96967 1.46967Z" fill="currentColor"/>
                  </svg>
                </button>
              `)}
            </div>
          `}

          ${C&&h`
            <div class="djs-popup-search-count" aria-live="polite">
              ${g.length} ${g.length===1?"result":"results"} found
            </div>
          `}

          <${Ce}
            groupedEntries=${X}
            selectedEntry=${i}
            setSelectedEntry=${T}
            keyboardSelection=${B}
            onPointerInteraction=${ge}
            onAction=${Q}
            idPrefix=${z}
            id=${_}
            ariaLabel=${p||"Results"}
            tabIndex=${A?-1:0}
            ariaActivedescendant=${A?void 0:ie||void 0}
          />

          ${i&&i.documentationRef&&h`
            <div class="djs-popup-footer">
              <a
                class="djs-popup-footer-docs"
                href=${i.documentationRef}
                onClick=${e=>e.stopPropagation()}
                aria-label=${i.label?`Open entry documentation for ${i.label}`:"Open entry documentation"}
                target="_blank"
                rel="noopener"
              >
                Open entry documentation

                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M10.6368 10.6375V5.91761H11.9995V10.6382C11.9995 10.9973 11.8623 11.3141 11.5878 11.5885C11.3134 11.863 10.9966 12.0002 10.6375 12.0002H1.36266C0.982345 12.0002 0.660159 11.8681 0.396102 11.6041C0.132044 11.34 1.52588e-05 11.0178 1.52588e-05 10.6375V1.36267C1.52588e-05 0.98236 0.132044 0.660173 0.396102 0.396116C0.660159 0.132058 0.982345 2.95639e-05 1.36266 2.95639e-05H5.91624V1.36267H1.36266V10.6375H10.6368ZM12 0H7.2794L7.27873 1.36197H9.68701L3.06507 7.98391L4.01541 8.93425L10.6373 2.31231V4.72059H12V0Z" fill="#818798"/>
                </svg>
              </a>
            </div>
          `}
        </div>
      `}
    ${m&&g.length===0&&h`
      <div class="djs-popup-no-results">${Ie(m)?m(H):m}</div>
    `}
    </${de}>
  `}function ce(l){typeof l.scrollIntoViewIfNeeded=="function"?l.scrollIntoViewIfNeeded():l.scrollIntoView({scrollMode:"if-needed",block:"nearest",inline:"nearest"})}function de(l){let{onClose:s,onKeydown:c,onKeyup:b,onKeyboardInteraction:$,className:a,children:p,navigationStack:Z,interactionMode:G,position:S}=l,m=R();q(()=>{if(typeof S!="function")return;let o=m.current,y=S(o);o.style.left=`${y.x}px`,o.style.top=`${y.y}px`},[m.current,S]),q(()=>{let o=m.current;if(!o)return;(o.querySelector("input")||o.querySelector('[role="listbox"]')||o).focus()},[Z]),O(()=>{let o=L=>{if(L.key==="Escape")return L.preventDefault(),s()},y=L=>{if(!W(L.target,".djs-popup",!0))return s()};return document.documentElement.addEventListener("keydown",o),document.body.addEventListener("click",y,!0),()=>{document.documentElement.removeEventListener("keydown",o),document.body.removeEventListener("click",y,!0)}},[]);let P=Le("djs-popup",a,{"djs-popup--pointer":G==="pointer"});return h`
    <div
      class=${P}
      style=${De(l)}
      onKeydownCapture=${$}
      onKeydown=${c}
      onKeyup=${b}
      ref=${m}
      tabIndex="-1"
    >
      ${p}
    </div>
  `}function De(l){let{width:s}=l,c=typeof s=="number"?`${s}px`:s;return{transform:`scale(${l.scale})`,width:ee(s)?c:void 0,maxWidth:ee(s)?"unset":void 0,"transform-origin":"top left"}}function Ae(l){let s=[];return l.forEach(c=>{c.entries.forEach(b=>{s.push(b)})}),s}function Te(l){let s=[];function c(b){b.forEach($=>{if($.entries){c($.entries);return}s.push($)})}return c(l),s}function Ke(l){let s=[],c=a=>s.find(p=>a.id===p.id),b=a=>!!c(a),$=a=>typeof a=="string"?{id:a}:a;return l.forEach(a=>{let p=a.group?$(a.group):{id:"default"};b(p)?c(p).entries.push(a):s.push({...p,entries:[a]})}),s}export{je as default,Ke as groupEntries};
//# sourceMappingURL=PopupMenuComponent.mjs.map
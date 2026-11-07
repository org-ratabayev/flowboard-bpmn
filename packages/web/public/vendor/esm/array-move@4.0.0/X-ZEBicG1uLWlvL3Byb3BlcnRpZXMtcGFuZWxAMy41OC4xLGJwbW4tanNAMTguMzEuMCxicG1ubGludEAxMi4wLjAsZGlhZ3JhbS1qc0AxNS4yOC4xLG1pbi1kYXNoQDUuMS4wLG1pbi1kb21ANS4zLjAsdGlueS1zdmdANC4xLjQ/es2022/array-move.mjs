/* esm.sh - array-move@4.0.0 */
function s(t,e,n){let c=e<0?t.length+e:e;if(c>=0&&c<t.length){let l=n<0?t.length+n:n,[i]=t.splice(e,1);t.splice(l,0,i)}}function u(t,e,n){return t=[...t],s(t,e,n),t}export{u as arrayMoveImmutable,s as arrayMoveMutable};
//# sourceMappingURL=array-move.mjs.map
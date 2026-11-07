/* esm.sh - bpmn-js@18.31.0/lib/features/modeling/behavior/util/LineIntersect */
function i(x,r,n,y){var t,a,o,u,d;return t=(y.y-n.y)*(r.x-x.x)-(y.x-n.x)*(r.y-x.y),t==0?null:(a=x.y-n.y,o=x.x-n.x,d=(y.x-n.x)*a-(y.y-n.y)*o,u=d/t,{x:Math.round(x.x+u*(r.x-x.x)),y:Math.round(x.y+u*(r.y-x.y))})}export{i as default};
//# sourceMappingURL=LineIntersect.mjs.map
/* esm.sh - diagram-js@15.28.1/lib/navigation/zoomscroll/ZoomUtil */
import{log10 as t}from"../../util/Math.mjs";function o(a,n){var e=t(a.min),i=t(a.max),r=Math.abs(e)+Math.abs(i);return r/n}function x(a,n){return Math.max(a.min,Math.min(a.max,n))}export{x as cap,o as getStepSize};
//# sourceMappingURL=ZoomUtil.mjs.map
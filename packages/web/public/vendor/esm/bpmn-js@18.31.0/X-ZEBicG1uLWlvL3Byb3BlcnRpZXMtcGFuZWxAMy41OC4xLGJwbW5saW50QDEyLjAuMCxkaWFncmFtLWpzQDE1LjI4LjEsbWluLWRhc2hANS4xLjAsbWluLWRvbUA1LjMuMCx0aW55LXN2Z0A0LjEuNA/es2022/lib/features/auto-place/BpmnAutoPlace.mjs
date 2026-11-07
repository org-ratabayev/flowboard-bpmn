/* esm.sh - bpmn-js@18.31.0/lib/features/auto-place/BpmnAutoPlace */
import{getNewShapePosition as a}from"./BpmnAutoPlaceUtil.mjs";function t(o,n){o.on("autoPlace",function(e){var r=e.shape,u=e.source;return a(u,r,n)})}t.$inject=["eventBus","elementRegistry"];export{t as default};
//# sourceMappingURL=BpmnAutoPlace.mjs.map
/* esm.sh - diagram-js@15.28.1/lib/features/rules/Rules */
function a(t){this._commandStack=t.get("commandStack",!1)}a.$inject=["injector"];a.prototype.allowed=function(t,n){var e=!0,c=this._commandStack;return c&&(e=c.canExecute(t,n)),e===void 0?!0:e};export{a as default};
//# sourceMappingURL=Rules.mjs.map
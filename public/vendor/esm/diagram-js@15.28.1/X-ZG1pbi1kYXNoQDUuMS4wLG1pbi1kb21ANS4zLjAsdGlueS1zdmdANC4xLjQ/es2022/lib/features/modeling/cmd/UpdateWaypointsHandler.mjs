/* esm.sh - diagram-js@15.28.1/lib/features/modeling/cmd/UpdateWaypointsHandler */
function e(){}e.prototype.execute=function(n){var o=n.connection,t=n.newWaypoints;return n.oldWaypoints=o.waypoints,o.waypoints=t,o};e.prototype.revert=function(n){var o=n.connection,t=n.oldWaypoints;return o.waypoints=t,o};export{e as default};
//# sourceMappingURL=UpdateWaypointsHandler.mjs.map
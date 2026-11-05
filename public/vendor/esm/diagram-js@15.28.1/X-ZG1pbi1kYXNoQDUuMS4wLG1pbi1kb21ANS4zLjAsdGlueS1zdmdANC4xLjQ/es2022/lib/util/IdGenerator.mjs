/* esm.sh - diagram-js@15.28.1/lib/util/IdGenerator */
function o(t){this._counter=0,this._prefix=(t?t+"-":"")+Math.floor(Math.random()*1e9)+"-"}o.prototype.next=function(){return this._prefix+ ++this._counter};export{o as default};
//# sourceMappingURL=IdGenerator.mjs.map
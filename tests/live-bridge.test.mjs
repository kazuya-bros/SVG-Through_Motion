import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveBridge} from '../web/live-bridge.js';

test('bridge confirms snapshot receipt and does not replay results into a new session',async()=>{
  const oldSocket=globalThis.WebSocket,oldLocation=globalThis.location;
  class Socket {
    static OPEN=1;static sockets=[];
    readyState=1;bufferedAmount=0;sent=[];
    constructor(){Socket.sockets.push(this);}
    send(raw){this.sent.push(JSON.parse(raw));}
    close(){this.readyState=3;this.onclose?.();}
    message(msg){return this.onmessage({data:JSON.stringify(msg)});}
  }
  globalThis.WebSocket=Socket;globalThis.location={protocol:'http:',host:'localhost:8765'};
  let complete;
  const statuses=[];
  const bridge=createLiveBridge({snapshot:async()=>({parts:[]}),state:()=>({playing:true}),
    execute:()=>new Promise(resolve=>{complete=resolve;}),onStatus:text=>statuses.push(text)});
  try{
    await bridge.connect();const first=Socket.sockets[0];
    const publication=bridge.publish();await Promise.resolve();
    bridge.push({mouth:1},100);
    assert.equal(first.sent.length,1);assert.equal(first.sent[0].type,'project');
    assert.ok(!statuses.some(s=>s.includes('反映しました')));
    await first.message({type:'published',revision:first.sent[0].revision});await publication;
    bridge.push({mouth:1},150);assert.equal(first.sent.at(-1).type,'pose');
    const execution=first.message({type:'command',id:'old',command:{action:'export'}});
    bridge.disconnect();await bridge.connect();const second=Socket.sockets[1];
    complete({saved:true});await execution;
    assert.equal(second.sent.length,0);
    const pending=bridge.publish();await Promise.resolve();bridge.disconnect();
    await assert.rejects(pending,/接続が切れました/);
  }finally{bridge.disconnect();globalThis.WebSocket=oldSocket;globalThis.location=oldLocation;}
});

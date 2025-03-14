// WebSocketManager.js
function WebSocketManager(wsUrl, agentName, funcMap, heartCheckTime = 59000) {
    let lockReconnect = false;
    let retry = 0;
    let ws = null;
    let isClosed = false;

    function createWebSocket() {
        try {
            if ('WebSocket' in window) {
                ws = new WebSocket(wsUrl);
            }
            initEventHandle();
        } catch (e) {
            reconnect(wsUrl);
            console.error(e);
        }
    }

    function initEventHandle() {
        ws.onclose = function() {
            reconnect(wsUrl);
            console.log("WebSocket close: " + new Date().toLocaleString());
        };
        ws.onerror = function(error) {
            console.log("WebSocket connect error!", error);
            reconnect(wsUrl);
        };
        ws.onopen = function() {
            heartCheck.reset().start();
            ws.send(`{"msg_type": "first_conn","agent": "${agentName}"}`);
            console.log("WebSocket connect success: " + new Date().toLocaleString());
        };
        ws.onmessage = function(event) {
            heartCheck.reset().start();
            console.log("recv data: " + event.data);
            if (event.data === 'pong') return;

            let data = JSON.parse(event.data);
            if (data.msg_type === "tools" && data.func_name in funcMap) {
                funcMap[data.func_name](data.params).then(func_result => {
                    let answerResp = {
                        id: data.id,
                        msg_type: "tools_result",
                        agent: agentName,
                        func_result: func_result
                    };
                    ws.send(JSON.stringify(answerResp));
                });
            } 
        };
    }

    function reconnect(url) {
        retry++;
        if (lockReconnect || retry > 10) return;
        lockReconnect = true;
        setTimeout(() => {
            createWebSocket(url);
            lockReconnect = false;
        }, 2000);
    }

    const heartCheck = {
        timeout: heartCheckTime,
        timeoutObj: null,
        serverTimeoutObj: null,
        reset: function() {
            clearTimeout(this.timeoutObj);
            clearTimeout(this.serverTimeoutObj);
            return this;
        },
        start: function() {
            this.timeoutObj = setTimeout(() => {
                ws.send("ping");
                this.serverTimeoutObj = setTimeout(() => {
                    ws.close();
                }, this.timeout);
            }, this.timeout);
        }
    };

    createWebSocket(wsUrl);

    const close = () => {
        isClosed = true;
        if (ws) {
          ws.close();
          ws = null;
        }
    };

    const status = () => {
        return ws ? ws.readyState : WebSocket.CLOSED;
    }

    const addFunc = (name,func) => {
        funcMap[name] = func;
    }

    return {close, status, addFunc};

}
window.WebSocketManager = WebSocketManager;

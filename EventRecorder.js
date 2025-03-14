/**
 * Creates an API client for recording events with GET, POST, and DELETE operations
 * @param {string} baseUrl - The base URL for the API endpoint
 * @returns {Object} An object containing methods for API operations:
 *   - Get: Retrieves event records via GET request
 *   - Insert: Creates new event records via POST request  
 *   - Delete: Removes event records via DELETE request
 * 
 * Each method accepts requestParams and returns a Promise that resolves with the API response
 * For GET requests, parameters are appended to URL as query string
 * For POST/DELETE requests, parameters are sent in request body as JSON
 * @throws {Error} If the API request fails or returns non-200 status
 */
function RecordAPI(baseUrl) {
    async function requestEventRecordsApi(method, requestParams) {
        try {
            const config = {
                method: method,
                headers: { "Content-Type": "application/json" }
            };

            // GET请求不应携带body，参数应拼接到URL
            if (method.toUpperCase() !== "GET") {
                config.body = JSON.stringify(requestParams);
            } else {
                const queryParams = new URLSearchParams(requestParams).toString();
                baseUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${queryParams}`;
            }

            const response = await fetch(baseUrl + "/api/record", config);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Error during API request:", error);
            throw error; // 重新抛出错误以便外部处理
        }
    }

    // 确保返回Promise
    const Get = (requestParams) => requestEventRecordsApi("GET", requestParams);
    const Insert = (requestParams) => requestEventRecordsApi("POST", requestParams);
    const Delete = (requestParams) => requestEventRecordsApi("DELETE", requestParams);

    return { Get, Insert, Delete };
}



/**
 * Creates an event recorder that can capture, save and replay user interactions.
 * Provides functionality to start/stop recording, handle events, and replay recorded actions.
 * 
 * @returns {Object} An object containing:
 *   - RegisterEvent: Function to register event listeners for specified event types
 *   - startRecording: Function to begin recording user actions
 *   - stopRecording: Function to stop recording and save the actions
 * 
 * The recorder captures clicks, inputs, changes and focus events by default.
 * Recorded actions are stored with timestamps and unique selectors for replay.
 * Actions can be saved to and retrieved from a remote API endpoint.
 */
function EventRecorder(baseUrl) {
    let isRecording = false; // record flag
    let actions = []; // recorded actions
    let recordAPI = RecordAPI(baseUrl);

    function startRecording() {
        isRecording = true;
        actions = []; 
        console.log("start recoding");
    }

    /**
     * Stops the current recording session.
     * Sets the recording flag to false and logs the completion message.
     */
    function stopRecording() {
        isRecording = false;
        console.log("stop recoding end");
        let functionName = prompt("请输入操作名称:");
        if (!functionName) return;

        let requestParams = JSON.stringify({ name: functionName, steps: actions });

        //保存事件
        recordAPI.Insert(requestParams).then(res => {
            console.log("send request:", requestParams);
            alert("保存成功");
        }).catch(err => {
            console.error("send request error:", err);
        });
        
    }

    function handleEvent(event) {
        if (!isRecording) {
            return;
        }
        console.log("get event",event, isRecording);

        // 忽略“结束记录”按钮的点击
        let target = event.target;
        if (target.id === "stopRecord") return;

        let selector = getUniqueSelector(target);
        let action = {
            type: event.type,
            selector: selector,
            value: target.value || "",
            timestamp: Date.now()
        };

        actions.push(action);
        console.log("record event:", action);
    }

    function replayActions(name) {
        console.log("开始重放..."), name;
        recordAPI.Get({ name: name }).then(eventRecords => {
            console.log("get record:", eventRecords);

            eventRecords.steps.forEach((step, i) => {
                setTimeout(() => {
                    let element = document.querySelector(step.selector);
                    if (!element) {
                        console.log("not found", step.selector);
                        return;
                    }
                    console.log("element:", element);

                    if (step.type === "click") {
                        element.click();
                    } else if (step.type === "input" || step.type === "change" || step.type === "focus") {
                        element.value = step.value;
                        element.dispatchEvent(new Event(step.type, { bubbles: true, isTrusted: true }));
                    }
                }, i * 500); // 模拟用户操作时间间隔
            });
        }).catch(err => {
            console.error("get record error:", err);
        });
    }

    function registerEvent(eventTypes = ["click", "input", "change", "focus"]) {
        eventTypes.forEach(type => {
            document.addEventListener(type, handleEvent);
        });
    }

    return { registerEvent, startRecording, stopRecording, replayActions }
}

// 获取唯一CSS选择器
function getUniqueSelector(element) {
    if (!element) return "";

    // 1. 优先使用 ID 选择器
    if (element.id) {
        const idSelector = `#${CSS.escape(element.id)}`;
        try {
            if (document.querySelectorAll(idSelector).length === 1) {
                return idSelector;
            }
        } catch (e) {
            console.warn("Invalid ID selector:", idSelector, e);
        }
    }

    // 2. 尝试使用 class 选择器
    if (element.classList?.length > 0) {
        const filteredClasses = Array.from(element.classList)
            .filter(str => !str.includes(":") && !str.includes("[") && !str.includes("focus"))
            .map(c => CSS.escape(c)); // 转义特殊字符

        if (filteredClasses.length > 0) {
            const className = "." + filteredClasses.join(".");
            try {
                if (document.querySelectorAll(className).length === 1) {
                    return className;
                }
            } catch (e) {
                console.warn("Invalid class selector:", className, e);
            }
        }
    }

    // 3. 计算元素在父元素中的索引
    function getElementIndex(el) {
        let index = 1;
        let sibling = el.previousElementSibling;
        while (sibling) {
            if (sibling.tagName === el.tagName) index++;
            sibling = sibling.previousElementSibling;
        }
        return index;
    }

    // 4. 递归构造层级选择器
    function getPath(el) {
        if (!el || el.tagName.toLowerCase() === "html") return "html";

        let selector = el.tagName.toLowerCase();
        const parent = el.parentElement;

        if (parent) {
            // 仅统计直接子元素中同标签的数量
            const sameTagSiblings = Array.from(parent.children)
                .filter(child => child.tagName === el.tagName);

            if (sameTagSiblings.length > 1) {
                selector += `:nth-of-type(${getElementIndex(el)})`;
            }
        }

        return `${getUniqueSelector(parent)} > ${selector}`;
    }

    return getPath(element);
}
window.EventRecorder = EventRecorder;
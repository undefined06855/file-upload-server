let socket = new WebSocket("ws/receiver");

class PartialFile {
    constructor(filename, length) {
        this.data = new Uint8Array(length);
        this.filename = filename;
        this.written = 0;
    }

    write(data) {
        this.data.set(data, this.written);
        this.written += data.size;
        console.log(data.size, this.written);
    }

    get done() {
        return this.written == this.data.length;
    }
};

/** @type {Record<string, PartialFile>} */
let files = {};

let currentFileStage = 0;
let currentFileName = "";
let currentFileLength = 0;

socket.addEventListener("message", event => {
    let text = event.data;

    switch (text) {
        case "host:connected": {
            console.log("host connected");
            document.querySelector("#server-state").innerText = "(host connected)";
        } break;

        case "host:disconnected": {
            console.log("host disconnected");
            document.querySelector("#server-state").innerText = "(host disconnected)";
        } break;

        default: {
            if (currentFileStage == 0) {
                // getting name
                currentFileName = event.data.toString();
                console.log(currentFileName);

                currentFileStage++;

                return;
            }

            if (currentFileStage == 1) {
                // getting length
                currentFileLength = parseInt(event.data.toString());
                console.log(currentFileLength);

                currentFileStage++;

                return;
            }

            if (currentFileStage == 2) {
                // getting data

                if (!(currentFileName in files)) {
                    files[currentFileName] = new PartialFile(currentFileName, currentFileLength);
                }
                
                files[currentFileName].write(event.data);
    
                if (files[currentFileName].done) {
                    console.log("file %s done", currentFileName);
    
                    let anchor = document.createElement("a");
                    anchor.href = URL.createObjectURL(new Blob([ files[currentFileName].data ]));
                    anchor.download = currentFileName;
                    anchor.click();
                    URL.revokeObjectURL(anchor.href);
    
                    currentFileStage = 0;
                }
            }
        }
    }
});

window.addEventListener("dragover", event => {
    event.preventDefault();
});

window.addEventListener("drop", async event => {
    event.preventDefault();

    document.querySelector("#server-state").innerText = "(you are the host!)";

    // now identify as a host, upload file
    socket.close();
    socket = new WebSocket("ws/host");
    
    /** @type {Record<string, ArrayBuffer} */
    let files = {};

    let filesReady = false;

    socket.addEventListener("open", async () => {
        if (filesReady) sendData(files);
    });

    // we cant just use event.dataTransfer.files in the callback because it just
    // disappears ??
    // so we need to manually copy beforehand

    let tempFiles = {};
    for (let file of Array.from(event.dataTransfer.files)) {
        let data = (await new Blob([file]).arrayBuffer()).transfer();
        tempFiles[file.name] = data;
    }
    files = tempFiles;
    filesReady = true;

    if (socket.readyState == WebSocket.OPEN) {
        sendData(files);
    }
});

/** @param {Record<string, ArrayBuffer>} files */
function sendData(files) {
    console.log(files);
    for (let [filename, data] of Object.entries(files)) {
        let offset = 0;
        let length = 1e7; // 10MB at a time

        socket.send(filename);
        socket.send(data.byteLength);

        while (offset < data.byteLength) {
            console.log("sending chunk from %s", offset);
            const slice = data.slice(offset, offset + length);
            socket.send(slice);
            offset += length;
        }
    }
}

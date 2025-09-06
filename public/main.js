let socket = new WebSocket("ws/receiver");

class PartialFile {
    constructor(filename, length) {
        this._data = "";
        this.filename = filename;
        this.written = 0;
    }

    write(data) {
        this._data += data;
        this.written += actualData.length;
    }

    get done() {
        return this.written == this._data.length;
    }

    get data() {
        return decode(this._data);
    }
};

/** @type {Record<string, PartialFile>} */
let files = {};

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
            // file data
            let [name, length, data] = text.split("|");
            console.log("receive file data chunk %s (len: %s)", name, length);

            console.log(name in files);

            if (!(name in files)) {
                files[name] = new PartialFile(name, length);
            }

            files[name].write(data);

            if (files[name].done) {
                console.log("file %s done", name);

                let anchor = document.createElement("a");
                anchor.href = URL.createObjectURL(new Blob([ files[name].data ]));
                anchor.download = name;
                anchor.click();
                URL.revokeObjectURL(anchor.href);
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

    socket.addEventListener("open", async () => {
        sendData(files);
    });

    // we cant just use event.dataTransfer.files in the callback because it just
    // disappears ??
    // so we need to manually copy beforehand

    let tempFiles = {};
    for (let file of Array.from(event.dataTransfer.files)) {
        let data = (await new Blob([file]).arrayBuffer()).transfer();
        tempFiles[file.name] = encode(data);
    }
    files = tempFiles;

    sendData(files);
});

let filesSent = [];

function sendData(files) {
    console.log(files);
    for (let [filename, data] of Object.entries(files)) {
        let offset = 0;
        let length = 5e6; // 5MB at a time

        if (filesSent.includes(filename)) continue;
        filesSent.push(filename);

        while (offset < data.length) {
            console.log("sending chunk from %s", offset);
            const slice = data.slice(offset, offset + length);
            socket.send(`${filename}|${data.byteLength}|${slice}`);
            offset += length;
        }
    }
}

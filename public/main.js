let socket = new WebSocket("ws/receiver");

class PartialFile {
    constructor(filename, length) {
        this.data = new Uint8Array(length);
        this.filename = filename;
        this.offset = 0;
    }

    write(data) {
        let actualData = data.split(",").map(string => parseInt(string));
        this.data.set(actualData, this.offset);
        this.offset += actualData.length;
    }

    get done() {
        return this.offset == this.data.length;
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

    // we cant just use event.dataTransfer.files in the callback because it just
    // disappears ??
    // so we need to manually copy beforehand

    /** @type {Record<string, ArrayBuffer} */
    let files = {};

    for (let file of Array.from(event.dataTransfer.files)) {
        let data = (await new Blob([file]).arrayBuffer()).transfer();
        files[file.name] = data;
    }
    
    console.log(files);

    socket.addEventListener("open", async () => {
        console.log(files);
        for (let [filename, data] of Object.entries(files)) {
            let offset = 0;
            let length = 5e6; // 5MB at a time

            while (offset < data.byteLength) {
                console.log("sending chunk from %s", offset);
                const slice = data.slice(offset, offset + length);
                socket.send(`${filename}|${data.byteLength}|${new Uint8Array(slice).toString()}`);
                offset += length;
            }
        }
    });
});

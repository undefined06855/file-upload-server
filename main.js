let receiversConnected = 0;
let hostConnected = false;

const server = Bun.serve({
    routes: {
        "/ws/:mode": req => {
            const mode = req.params.mode;
            if (mode != "host" && mode != "receiver") {
                return new Response("invalid mode selected");
            }

            server.upgrade(req, {
                data: { mode }
            });
        },

        "/": async req => {
            const files = [
                "public/base65536.js",
                "public/main.js"
            ];

            const js = (
                await Promise.all(
                    files.map(file => Bun.file(file).text())
                )
            ).join("\n\n");

            const css = await Bun.file("public/style.css").text();

            let html = await Bun.file("public/index.html").text();

            html = html.replace("/**script**/", js);
            html = html.replace("/**style**/", css);

            return new Response(
                html,
                {
                    headers: { "Content-Type": "text/html" }
                }
            );
        }
    },

    websocket: {
        message(sock, message) {
            if (sock.data.mode == "host") {
                server.publish("receivers", message);
            } else {
                server.publish("host", message);
            }
        },

        open(sock) {
            if (sock.data.mode == "host") {
                if (hostConnected) {
                    sock.close(4100, "host already connected");
                    return;
                }

                hostConnected = true;
                sock.subscribe("host");
                server.publish("receivers", "host:connected");
                console.log("host connected");
            } else {
                // web ui connects as receiver first
                // if (receiverConnected) {
                //     sock.close(4101, "receiver already connected");
                //     return;
                // }

                receiversConnected++;
                sock.subscribe("receivers");
                server.publish("host", `receivers:${receiversConnected}`);
                console.log("receiver connected");
            }
        },

        close(sock, code, message) {
            if (code >= 4100) return; // initiated by server, do not handle

            if (sock.data.mode == "host") {
                hostConnected = false;
                sock.unsubscribe("host");
                server.publish("receivers", "host:disconnected");
                console.log("host disconnected");
            } else {
                receiversConnected--;
                sock.unsubscribe("receivers");
                server.publish("host", `receivers:${receiversConnected}`);
                console.log("receiver disconnected");
            }
        },

        perMessageDeflate: true
    },

    port: 2002
});

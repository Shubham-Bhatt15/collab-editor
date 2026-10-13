import { Server } from "@hocuspocus/server";

const server = Server.configure({
  port: 1234,

  async onConnect({ documentName }) {
    console.log(`client connected to "${documentName}"`);
  },

  async onDisconnect({ documentName }) {
    console.log(`client left "${documentName}"`);
  },
});

server.listen();
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { smtpTransport } from "../dist/mail.js";
test("corporate SMTP adapter delivers to a loopback test server without external recipients", async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    MAIL_ENABLED: "true",
    MAIL_FROM: "reports@example.invalid",
    SMTP_HOST: "127.0.0.1",
  });
  let message = "";
  const server = createServer((socket) => {
    socket.write("220 synthetic SMTP\r\n");
    let buffer = "",
      data = false;
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n"),
          line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            data = false;
            socket.write("250 accepted\r\n");
          } else message += line + "\n";
          continue;
        }
        if (line.startsWith("EHLO"))
          socket.write("250-synthetic\r\n250 SIZE 1000000\r\n");
        else if (line.startsWith("DATA")) {
          data = true;
          socket.write("354 send message\r\n");
        } else if (line.startsWith("QUIT")) socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.SMTP_PORT = String((server.address() as { port: number }).port);
  const transport = smtpTransport();
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM,
      to: "test@example.invalid",
      subject: "Synthetic report",
      text: "Production: 10",
    });
    assert.match(message, /Production: 10/);
    assert.match(message, /Synthetic report/);
  } finally {
    transport.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

import { createServer, type Server, type Socket } from 'node:net';
import {
  createServer as createTlsServer,
  createSecureContext,
  TLSSocket,
} from 'node:tls';

type Session = {
  encrypted: boolean;
  authenticated: boolean;
  receiving: boolean;
  lines: string[];
  pending: string;
};

/** Loopback-only protocol fixture exercises the real Nodemailer TLS/auth boundary without reaching an email provider. */
export class SmtpFixture {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  readonly messages: string[] = [];
  readonly authenticationEncrypted: boolean[] = [];

  /** Receives ephemeral test certificates and the one transport behavior under test. */
  constructor(
    private readonly mode: 'starttls' | 'implicit' | 'plaintext',
    private readonly certificate: { key: string; cert: string },
    private readonly rejectAuthentication = false,
  ) {
    this.server =
      mode === 'implicit'
        ? createTlsServer(certificate, (socket) =>
            this.attach(socket, true, true),
          )
        : createServer((socket) => this.attach(socket, false, true));
    this.server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
  }

  /** Binds an ephemeral loopback port; tests never listen on a public interface. */
  async listen(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', resolve);
    });
    return (this.server.address() as { port: number }).port;
  }

  /** Destroys only this fixture's sockets before closing its listening port. */
  async close(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  /** Installs line handling before greeting a new connection or resuming after STARTTLS. */
  private attach(socket: Socket, encrypted: boolean, greeting: boolean): void {
    const session: Session = {
      encrypted,
      authenticated: false,
      receiving: false,
      lines: [],
      pending: '',
    };
    socket.on('error', () => {
      /* Certificate and disconnect failures are expected test outcomes. */
    });
    socket.on('data', (chunk: Buffer) => this.read(socket, session, chunk));
    if (greeting) {
      socket.write('220 localhost fixture\r\n');
    }
  }

  /** Buffers fragmented TCP frames; only complete SMTP lines advance the fixture. */
  private read(socket: Socket, session: Session, chunk: Buffer): void {
    session.pending += chunk.toString('utf8');
    while (session.pending.includes('\r\n')) {
      const end = session.pending.indexOf('\r\n');
      const line = session.pending.slice(0, end);
      session.pending = session.pending.slice(end + 2);
      this.command(socket, session, line);
    }
  }

  /** Implements just the SMTP exchanges needed to prove TLS, authentication and single-recipient submission. */
  private command(socket: Socket, session: Session, line: string): void {
    if (session.receiving && line !== '.') {
      session.lines.push(line);
      return;
    }
    if (session.receiving) {
      session.receiving = false;
      this.messages.push(session.lines.join('\r\n'));
      session.lines = [];
      socket.write('250 queued\r\n');
      return;
    }
    const command = line.split(' ')[0]!.toUpperCase();
    if (command === 'EHLO') {
      const starttls =
        !session.encrypted && this.mode === 'starttls'
          ? '250-STARTTLS\r\n'
          : '';
      socket.write(`250-localhost\r\n${starttls}250 AUTH PLAIN\r\n`);
      return;
    }
    if (
      command === 'STARTTLS' &&
      !session.encrypted &&
      this.mode === 'starttls'
    ) {
      socket.write('220 start TLS\r\n', () => {
        socket.removeAllListeners('data');
        const secured = new TLSSocket(socket, {
          isServer: true,
          secureContext: createSecureContext(this.certificate),
        });
        this.attach(secured, true, false);
      });
      return;
    }
    if (command === 'AUTH') {
      this.authenticationEncrypted.push(session.encrypted);
      session.authenticated =
        session.encrypted &&
        !this.rejectAuthentication &&
        Buffer.from(line.split(' ')[2] ?? '', 'base64').toString() ===
          '\0fixture-user\0fixture-password';
      socket.write(
        session.authenticated
          ? '235 authenticated\r\n'
          : '535 credentials rejected\r\n',
      );
      return;
    }
    if (['MAIL', 'RCPT', 'DATA'].includes(command) && !session.authenticated) {
      socket.write('530 authentication required\r\n');
      return;
    }
    if (command === 'MAIL' || command === 'RCPT') {
      socket.write('250 accepted\r\n');
      return;
    }
    if (command === 'DATA') {
      session.receiving = true;
      socket.write('354 send message\r\n');
      return;
    }
    if (command === 'QUIT') {
      socket.end('221 goodbye\r\n');
      return;
    }
    socket.write('502 command unavailable\r\n');
  }
}

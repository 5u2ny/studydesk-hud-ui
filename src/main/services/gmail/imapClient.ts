import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface FetchedEmail {
  uid: number;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
  flags: string[];
}

const TIMEOUT_MS = 30_000;

// Kept as a small pure helper because the OAuth tests assert the SASL shape,
// even though ImapFlow accepts accessToken directly.
export function buildXOAuth2(email: string, accessToken: string): string {
  const raw = `user=${email}\x01auth=Bearer ${accessToken}\x01\x01`;
  return Buffer.from(raw).toString('base64');
}

/**
 * Connect to Gmail IMAP and fetch the latest N messages. Auth method is
 * decided by the auth arg: pass `{ password }` for App Password (legacy)
 * or `{ accessToken }` for OAuth2 (XOAUTH2).
 */
export async function fetchRecent(
  email: string,
  auth: string | { password?: string; accessToken?: string },
  maxResults = 20,
): Promise<FetchedEmail[]> {
  const fetchPromise = (async () => {
    const a = typeof auth === 'string' ? { password: auth } : auth;
    if (!a.accessToken && !a.password) {
      throw new Error('IMAP auth requires either a password (App Password) or accessToken (OAuth2)');
    }
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: a.accessToken
        ? { user: email, accessToken: a.accessToken }
        : { user: email, pass: a.password!.replace(/\s+/g, '') },
      logger: false,
    });
    const results: FetchedEmail[] = [];
    await client.connect();
    let lock;
    try {
      lock = await client.getMailboxLock('INBOX');
      const total = client.mailbox ? client.mailbox.exists : 0;
      if (total === 0) return results;

      const start = Math.max(1, total - maxResults + 1);
      for await (const msg of client.fetch(`${start}:*`, {
        uid: true,
        source: true,
        envelope: true,
        flags: true,
      })) {
        if (!msg.source) continue;
        try {
          const parsed = await simpleParser(msg.source as any);
          results.push({
            uid: msg.uid,
            from: parsed.from?.text ?? '',
            subject: parsed.subject ?? '(no subject)',
            body: parsed.text ?? '',
            receivedAt: parsed.date ?? msg.envelope?.date ?? new Date(),
            flags: Array.from(msg.flags ?? []),
          });
        } catch {
          // Skip malformed messages; one bad email should not break polling.
        }
      }
      return results;
    } finally {
      lock?.release();
      await client.logout().catch(() => undefined);
    }
  })();

  return Promise.race([
    fetchPromise,
    new Promise<FetchedEmail[]>((_, reject) =>
      setTimeout(() => reject(new Error('IMAP timeout')), TIMEOUT_MS),
    ),
  ]);
}

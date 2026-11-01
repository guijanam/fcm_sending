export class ServiceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new ServiceError(code, message); };

function object(data, keys) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !keys.includes(k))) fail('invalid-argument', 'Invalid request payload.');
}
function validate(data) {
  object(data, ['title','body','requestId','dryRun']);
  for (const [key, max] of [['title',80],['body',1000]]) {
    if (typeof data[key] !== 'string' || !data[key].trim() || [...data[key]].length > max) fail('invalid-argument', 'Invalid notification text.');
  }
  if (typeof data.dryRun !== 'boolean' || typeof data.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.requestId)) fail('invalid-argument', 'Invalid request identifier or mode.');
  const message = {topic:'documents',notification:{title:data.title,body:data.body},android:{notification:{channelId:'fcm_messages'}}};
  if (Buffer.byteLength(JSON.stringify(message), 'utf8') > 2048) fail('invalid-argument', 'Notification payload is too large.');
  return message;
}

export function createService({getConfig, store, sendMessage, now = Date.now, emulator = false}) {
  function authorize(auth) {
    const config = getConfig();
    const email = typeof config.adminEmail === 'string' ? config.adminEmail.trim().toLowerCase() : '';
    if (!email) fail('failed-precondition', 'Administrator configuration is missing.');
    if (!auth) fail('unauthenticated', 'Sign in is required.');
    const token = auth.token;
    if (!auth.uid || typeof token?.email !== 'string' || token.email.trim().toLowerCase() !== email || token.email_verified !== true || token.firebase?.sign_in_provider !== 'google.com' || (config.adminUid && auth.uid !== config.adminUid.trim())) {
      fail('permission-denied', 'Administrator access is required.');
    }
    return email;
  }
  return {
    async send({auth,data}) {
      authorize(auth);
      const message = validate(data);
      if (emulator) fail('failed-precondition', 'Messaging is disabled in emulators.');
      const record = {...data, mode:data.dryRun ? 'dry-run' : 'live', status:'pending', createdAt:now()};
      const reservation = await store.reserve(record);
      if (!reservation.fresh) {
        const original = reservation.record;
        if (original.title !== data.title || original.body !== data.body || original.dryRun !== data.dryRun) fail('already-exists', 'Request identifier was already used with different content.');
        return {requestId:data.requestId,status:original.status,...(original.messageId ? {messageId:original.messageId} : {}),duplicate:true};
      }
      let messageId;
      let status;
      try {
        messageId = await sendMessage(message, data.dryRun);
        status = data.dryRun ? 'validated' : 'accepted';
      } catch (error) {
        const definitive = new Set(['messaging/invalid-argument','messaging/invalid-payload','messaging/payload-size-limit-exceeded','messaging/invalid-options','messaging/invalid-recipient','messaging/authentication-error','messaging/mismatched-credential','messaging/third-party-auth-error']);
        status = definitive.has(error?.code) ? 'failed' : 'unknown';
      }
      const result = {requestId:data.requestId,status,...(messageId ? {messageId} : {})};
      try {
        await store.settle(data.requestId, {status,...(messageId ? {messageId} : {})});
      } catch {
        // The durable pending reservation forbids retry even if settlement fails.
        return {requestId:data.requestId,status:'unknown'};
      }
      return result;
    },
    async list({auth,data}) {
      authorize(auth);
      object(data, []);
      const records = await store.list(20);
      return {items:records.slice(0,20).map(r => ({requestId:r.requestId,title:r.title,body:r.body,status:r.status,createdAt:new Date(r.createdAt).toISOString(),mode:r.mode,...(r.messageId ? {messageId:r.messageId} : {})}))};
    },
    async status({auth,data}) {
      const email = authorize(auth);
      object(data, []);
      return {topic:'documents',projectId:'mydia-29ac2',email};
    },
  };
}

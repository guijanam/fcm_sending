import {ServiceError} from './service.js';

export function createFirestoreStore(db) {
  const announcements = db.collection('fcm_admin_announcements');
  const state = db.collection('fcm_admin_state').doc('global');
  return {
    async list(limit = 20) {
      const snapshot = await announcements.orderBy('createdAt', 'desc').limit(Math.min(limit, 20)).get();
      return snapshot.docs.map(doc => doc.data());
    },
    async settle(requestId, update) {
      const ref = announcements.doc(requestId);
      await db.runTransaction(async tx => {
        const existing = await tx.get(ref);
        if (!existing.exists) throw new ServiceError('not-found', 'Announcement reservation is missing.');
        if (existing.data().status === 'pending') tx.update(ref, update);
      });
    },
    async reserve(record) {
      const ref = announcements.doc(record.requestId);
      return db.runTransaction(async tx => {
        const existing = await tx.get(ref);
        if (existing.exists) return {fresh:false,record:existing.data()};
        const global = await tx.get(state);
        if (global.exists && record.createdAt - global.data().lastReservedAt < 30000) {
          throw new ServiceError('resource-exhausted','Wait 30 seconds between announcements.');
        }
        tx.create(ref, record);
        tx.set(state, {lastReservedAt:record.createdAt});
        return {fresh:true,record};
      });
    },
  };
}

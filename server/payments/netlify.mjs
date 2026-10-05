/**
 * Shared setup for the payment functions: the Netlify Blobs store and the
 * payments app, created once per function instance.
 */
import { getStore } from '@netlify/blobs';
import { createPayments } from './index.mjs';
import { blobStore } from './store.mjs';

export const STORE_NAME = 'folio-payments';
let app = null;

export const paymentsStore = () => blobStore(getStore({ name: STORE_NAME, consistency: 'strong' }));

export function payments() {
  if (!app) app = createPayments({ store: paymentsStore(), env: process.env });
  return app;
}

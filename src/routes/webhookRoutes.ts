import { Router } from 'express';
import { handleStanStoreWebhook } from '../controllers/webhookController';

const router = Router();

// Stan Store Webhook endpoint (triggered via Zapier upon purchase)
router.post('/stan-store', handleStanStoreWebhook);

export default router;

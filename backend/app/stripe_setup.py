"""One-time Stripe setup: registers the webhook endpoint and prints its signing secret.

    STRIPE_SECRET_KEY=sk_test_... python -m app.stripe_setup https://<api-host>/api/v1/billing/webhooks/stripe

Put the printed whsec_... value into STRIPE_WEBHOOK_SECRET on the API service. The secret is shown only once."""
import sys

from .config import get_settings
from .payments import register_webhook

if __name__ == "__main__":
    if not get_settings().stripe_enabled:
        sys.exit("Set STRIPE_SECRET_KEY first.")
    if len(sys.argv) != 2 or not sys.argv[1].startswith("https://"):
        sys.exit("Usage: python -m app.stripe_setup https://<api-host>/api/v1/billing/webhooks/stripe")
    ep = register_webhook(sys.argv[1])
    print(f"webhook {ep['id']} -> {ep['url']}")
    print(f"STRIPE_WEBHOOK_SECRET={ep['secret']}")

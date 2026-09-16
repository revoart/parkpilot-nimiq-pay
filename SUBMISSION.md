# ParkPilot — Hackathon Submission

Nimiq Mini Apps Competition.

---

## Description (under 250 words)

ParkPilot is a parking app built for Nimiq Pay that makes paying for parking as
easy as a tap.

Finding and paying for parking is fragmented: accounts, cards, minimum spend.
ParkPilot removes all of it. Open the mini app inside Nimiq Pay and your Nimiq
account becomes your identity and your payment method. It is built for everyday
drivers who already hold NIM and want to move on.

The experience is parking-first. Search downtown Toronto, compare spaces on a
map, pick a date and time, and review the price. Pay in NIM — Nimiq's native
coin — and confirm in Nimiq Pay. The backend then verifies the transaction
on-chain — recipient, sender, amount, execution result and confirmations —
before issuing a confirmed parking pass. Payment is never trusted from the
client.

Nimiq Pay is core, not decorative. ParkPilot uses the injected Nimiq provider
for the account, the NIM transfer and the signed server-issued challenge that
links a wallet-backed identity. There is no EVM wallet and no token contract:
NIM is a coin, so the transfer moves the native currency directly.

Parking is a daily, real-world need. A wallet-native checkout removes friction
from a payment people already dislike, and every confirmed booking gets a
verifiable, public receipt on the Nimiq chain.

ParkPilot is not another crypto app. It is a better way to find and pay for
parking, with Nimiq Pay as the rails.

---

## Submission checklist

- [ ] Public GitHub repository (MIT)
- [ ] Production HTTPS URL that loads inside Nimiq Pay
- [ ] Demo video (90–120 seconds, follows the demo script below)
- [ ] Screenshots (home, search, detail, review, payment, pass, my parking)
- [x] MIT `LICENSE`
- [x] 250-word description (above)
- [ ] Nimiq wallet payout address
- [ ] Designated team lead

### Nimiq payout address

```
NQ94 FAH0 YLHQ S40D 5B2U XUDR L6XG 3GYU 2JEX
```

---

## Demo script

1. Open ParkPilot inside Nimiq Pay.
2. See **“Find parking.”**
3. Search **Downtown Toronto** (or Union Station / Eaton Centre).
4. Browse parking options; toggle the map.
5. Select a parking space.
6. See the price in **NIM**, with a USDT equivalent.
7. Choose a date and time.
8. Tap **Reserve Parking**.
9. Review the payment (parking, date, time, amount, coin, network, recipient).
10. Tap **Pay with NIM**.
11. Confirm in the Nimiq Pay wallet dialog.
12. See **Payment submitted.**
13. The backend verifies the Nimiq transaction.
14. See **Payment confirmed.**
15. View the **Parking Pass**.
16. Open the transaction on the Nimiq explorer.
17. Return to ParkPilot.
18. Find the reservation under **My Parking**.

---

## Scoring alignment

| Criterion | How ParkPilot addresses it |
| --- | --- |
| Functionality, reliability, usefulness | Complete reserve → pay → verify → pass flow; availability locking; idempotent verification; clear loading/empty/error states |
| Nimiq Pay and Nimiq integration | Nimiq provider only; a real native NIM transfer (`sendBasicTransaction`); Nimiq `listAccounts` + `sign` identity, with the Ed25519 signature bound to the account address |
| Real usage | Anonymous analytics for the core funnel; ready for real testers |
| Design and UX | Parking-first, mobile WebView-optimised, minimal, premium |
| Builder promotion | Demo link, screenshots, demo video, launch post |

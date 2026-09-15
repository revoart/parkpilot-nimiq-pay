-- ParkPilot demo catalogue: Toronto parking listings.
-- These are clearly identified demo/host spaces. price_usdt is an hourly rate.
-- payment_recipient_address is a PUBLIC wallet address supplied through
-- configuration. No private keys exist in this repository.

insert into parking_spaces (
  id, title, description, address, latitude, longitude, price_usdt,
  payment_recipient_address, parking_type, covered, ev_charging, accessible, active
) values
  (
    '11111111-1111-4111-8111-111111111101',
    'Union Station Garage',
    'Secure covered garage steps from Union Station and the PATH network. 24/7 access with in-and-out privileges.',
    '65 Front St W, Toronto, ON',
    43.6453, -79.3806, 4.50,
    '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F',
    'garage', true, false, true, true
  ),
  (
    '11111111-1111-4111-8111-111111111102',
    'Eaton Centre Parkade',
    'Underground parkade beneath the Eaton Centre. Direct access to Yonge-Dundas Square.',
    '220 Yonge St, Toronto, ON',
    43.6544, -79.3807, 5.00,
    '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F',
    'underground', true, true, true, true
  ),
  (
    '11111111-1111-4111-8111-111111111103',
    'Financial District Tower Parking',
    'Premium underground parking in the heart of the Financial District with EV charging bays.',
    '100 King St W, Toronto, ON',
    43.6487, -79.3817, 6.00,
    '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F',
    'underground', true, true, true, true
  ),
  (
    '11111111-1111-4111-8111-111111111104',
    'Scotiabank Arena Lot',
    'Surface lot beside Scotiabank Arena. Ideal for events and concerts.',
    '40 Bay St, Toronto, ON',
    43.6435, -79.3791, 4.00,
    '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F',
    'lot', false, false, false, true
  ),
  (
    '11111111-1111-4111-8111-111111111105',
    'Entertainment District Surface Lot',
    'Open-air lot in the Entertainment District, close to King West restaurants and theatres.',
    '325 King St W, Toronto, ON',
    43.6448, -79.3957, 3.50,
    '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F',
    'lot', false, false, false, true
  ),
  (
    '11111111-1111-4111-8111-111111111106',
    'Distillery District Lot',
    'Easy flat-rate lot a short walk from the Distillery District and Trinity Street.',
    '55 Mill St, Toronto, ON',
    43.6503, -79.3596, 3.00,
    '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F',
    'lot', false, false, true, true
  ),
  (
    '11111111-1111-4111-8111-111111111107',
    'Harbourfront Centre Parking',
    'Covered garage along Queens Quay, steps from the waterfront and ferry terminal.',
    '235 Queens Quay W, Toronto, ON',
    43.6387, -79.3817, 3.75,
    '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F',
    'garage', true, false, true, true
  ),
  (
    '11111111-1111-4111-8111-111111111108',
    'King West Garage',
    'Modern covered garage on King West with EV charging and accessible spaces.',
    '550 King St W, Toronto, ON',
    43.6449, -79.3970, 4.25,
    '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F',
    'garage', true, true, true, true
  )
on conflict (id) do nothing;

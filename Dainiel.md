# GAWA Admin — Changes & Added Features

## Schema Alignment (Phase 1)

### Equipment Listing Skills
- Renamed `equipment_listing_skill` → `equipment_listing_skills` across all code + schema.sql

### Reviews — Read-Only
- Server: `listReviews`, `getReviewById` only (no moderate)
- Client: Oversight → Reviews tab (read-only list + detail), SupportDashboard → Recent Reviews
- Removed `moderateReview` permission

### Rentals — Read-Only on `equipment_rentals`
- Live columns: `rental_id`, `listing_id`, `renter_id`, `owner_id`, `start_date`, `end_date`, `total_price`, `security_deposit_paid`, `rental_status`, `created_at`, `updated_at`
- Server: `listRentals`, `getRentalById` on `equipment_rentals`
- Dashboard: `equipment_rentals` + `rental_status = 'active'`
- Client: Rentals page (Jobs-style header/search + Listings-style columns), RentalDetail (live fields only)

### Schema Docs
- `reviews` table → live columns
- Replace `rentals`/`return_records`/`rental_check_ins` → `equipment_rentals`
- `job_completion.supporting_images_url` text → `text[]`

---

## Flag/Report Pipeline (Phase 2)

### Report Decision UI (Oversight)
- Keep / Warn / Remove buttons on report detail (uses existing `moderateReport` permission)
- ConfirmModal for Remove

### "Remove" Decision Acts on Content
- `job` → hard delete `job_posts`
- `listing` → hard delete `equipment_listings`
- `review` → hard delete `reviews` + audit log
- `user` → suspend via `user_suspensions`

### Review Reports
- Migration: add `'review'` to `reports.target_type` check constraint
- Mobile adds report button on reviews

### Direct Admin Review Removal
- `POST /reviews/:id/flag` → `entity_flags`
- `POST /reviews/:id/remove` → hard delete + audit log
- Detail panel: Flag (admin+support) + Remove (admin-only) buttons

---

## Rental Management — Data & Actions

### Seeded Data (6 rows)
| Equipment | Renter | Owner | Days | Price | Deposit | Status |
|---|---|---|---|---|---|---|
| Pipe Wrench Set | Juan Dela Cruz | Daniel Reyes | 3 | ₱750 | ₱500 | completed |
| Extension Ladder 20ft | Jose Ramirez | Angela Cruz | 7 | ₱1,800 | ₱1,000 | active |
| Portable Welding Machine | Roberto Garcia | Rommel Santos | 5 | ₱4,000 | ₱3,000 | active |
| Circular Saw | Maria Santos | Bea Fernandez | 2 | ₱700 | ₱800 | active |
| Concrete Mixer | Pedro Reyes | Daniel Reyes | 14 | ₱10,000 | ₱4,000 | cancelled |
| HVAC Vacuum Pump Kit | Mark Torres | Angela Cruz | 7 | ₱2,200 | ₱1,200 | completed |

- Live constraint allows: `active`, `completed`, `cancelled` only
- Fixed UUIDs `51000000-...`, `ON CONFLICT DO NOTHING`

### Rental Actions (Job-Style)
- `POST /rentals/:id/flag` → `entity_flags` (fallback audit log)
- `POST /rentals/:id/remove` → hard delete + audit log
- Detail page: Flag/Remove buttons with confirm modals
- Permissions: `flagRental` (admin+support), `removeRental` (admin only)

---

## Files Modified

### Server
- `server/controllers/rentals.js` — read-only + flag/remove
- `server/routes/rentals.js` — GET + POST flag/remove
- `server/controllers/dashboard.js:44` — `equipment_rentals` + `rental_status`
- `server/controllers/reviews.js` — read-only
- `server/routes/reviews.js` — removed moderate
- `server/controllers/skills.js`, `listings.js`, `users.js` — plural table name

### Client
- `client/src/api/rentals.js` — flag/remove
- `client/src/api/reviews.js` — removed moderate
- `client/src/pages/Rentals.jsx` — Jobs layout + Listings columns
- `client/src/pages/RentalDetail.jsx` — live fields + Flag/Remove
- `client/src/pages/ListingDetail.jsx` — rental history field mapping
- `client/src/pages/Oversight.jsx` — Reviews tab (read-only)
- `client/src/pages/SupportDashboard.jsx` — Recent Reviews
- `client/src/utils/permissions.js` — removed `moderateReview`, added `flagRental`/`removeRental`

### DB
- `server/db/seed-equipment-rentals.sql` — deterministic, live-constraint-aware
- `server/db/schema.sql` — plural table refs (documentation)

---

## Verification
- `npm run build` ✅
- Grep clean: no `equipment_listing_skill`, `from('rentals')`, `depositStatus`, `return_records`, `rental_check_ins`, `moderateReview`, `totalAmount`
- 6 rentals visible in admin with Flag/Remove actions
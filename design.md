# GAWA Admin Portal — UI Design System

## Overview

GAWA is a talent and equipment rental matching platform for skilled trades and event services. The Admin Portal serves internal staff (admins, customer support agents) to manage users, jobs, listings, transactions, disputes, reviews, messages, notifications, assessments, and platform settings. The interface prioritizes operational efficiency, data density, and clear information hierarchy suitable for a back-office environment.

## Layout Structure

### Shell Layout (app-shell)
- **Two-column flex layout**: collapsible sidebar (`sidebar` | `228px`/`56px`) + scrollable main content (`app-main`, `flex: 1`).
- The root container uses `display: flex; min-height: 100dvh; width: 100%`.
- Main content area scrolls independently via `overflow-y: auto`.

### Page Layout Patterns
Each list page follows a consistent template:
1. **Page head**: title (`.page-title`, `.um-page-head`) + optional archive toggle + action buttons.
2. **Stats row**: grid of KPI stat cards (`.um-stats`, `.dp-stats`, `.tx-stats`, `.as-stats`).
3. **Panel** (`.um-panel`, `.dp-panel`, `.tx-panel`, `.as-panel`): white card containing filter bar + search bar + data table + pagination.
4. **Detail pages** (`.um-detail-page`): toolbar + header card + stat strip + two-column body (main + sidebar).

### Grid Systems
| Context | Grid Definition | Gap |
|---|---|---|
| Dashboard main | `1fr 220px` | `--space-5` |
| KPI row | `repeat(5, 1fr)` → `repeat(3,1fr)` → `repeat(2,1fr)` | `--space-2` |
| Charts row | `1fr 1fr 1fr` → `1fr` | `--space-4` |
| Metrics row | `1fr 1fr` → `1fr` | `--space-4` |
| Stats cards | `repeat(4,1fr)` / `repeat(3,1fr)` | `--space-3` |
| Detail body | `minmax(0,1fr) 280px` → `1fr` | `--space-4` |
| Detail header | `repeat(3, 1fr)` → `repeat(2,1fr)` → `1fr` | `--space-3` `--space-5` |
| Settings | `1fr 1fr` → `1fr` | `24px` |
| Jobs/Listings layout | `1fr 240px` → `1fr` | `--space-4` |

### Responsive Breakpoints
| Breakpoint | Behavior |
|---|---|
| ≤1100px | KPI rows go 3-col; dashboard sidebar collapses; settings grid stacks |
| ≤900px | Dashboard → single column; charts → single column; detail sidebar → wraps |
| ≤768px | Sidebar becomes fixed bottom nav bar; stats → 2-col; padding reduces to `--space-4`; detail grids → single column |
| ≤640px | Detail header grid → single column; stats → 1-col |
| ≤600px | Padding → `--space-4`/`--space-3`; KPI rows → 2-col |

## Navigation Elements

### Sidebar
- **Position**: sticky, full-height, left side (min-height: 100dvh).
- **States**: collapsed (56px) / expanded (228px), toggled via pin button.
- **Transition**: 250ms cubic-bezier(0.16, 1, 0.3, 1).
- **Logo row**: SVG logo + wordmark (hidden when collapsed).
- **User section**: avatar initial + name + role badge (`.sidebar-role-admin` / `.sidebar-role-support_agent`).
- **Nav sections**: grouped by section labels (hidden when collapsed).
- **Nav items**: icon + label, 12px font, 500 weight. Active state uses purple highlight (`rgba(132, 85, 255, 0.22)`). Hover uses `rgba(132, 85, 255, 0.14)`.
- **Logout**: bottom of sidebar, turns red on hover.
- **Mobile (≤768px)**: fixed bottom bar, horizontal orientation, logo/user/labels hidden.

### Breadcrumbs (detail pages)
- `.um-detail-toolbar`: back button + breadcrumb path with separators + current item.
- Back button: 36x36px rounded square with border, accent color on hover.
- Breadcrumb text: `--text-xs` (10-12px), 600 weight, muted color, accent on hover.

### Tabs (detail pages)
- `.um-detail-tabs`, `.notif-tabs`, `.as-qm-tabs`: horizontal tab bar with bottom border.
- Active tab: accent-colored bottom border (2px) + accent text color.
- Hover: darkens text color.
- Tab group pills (notifications): segmented control style using `--color-surface-offset` background.

## Visual Components

### Typography
- **Font family**: Satoshi (primary), Inter (fallback), both sans-serif.
- **Scale** (fluid via `clamp()`):

| Token | Size |
|---|---|
| `--text-xs` | clamp(0.65rem, 0.6rem + 0.2vw, 0.75rem) |
| `--text-sm` | clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem) |
| `--text-base` | clamp(0.875rem, 0.8rem + 0.3vw, 1rem) |
| `--text-lg` | clamp(1rem, 0.9rem + 0.5vw, 1.25rem) |
| `--text-xl` | clamp(1.25rem, 1rem + 1vw, 1.75rem) |

- Monospace: `'Courier New', monospace` / `'SF Mono', 'Fira Code', 'Cascadia Code', monospace` for IDs, codes, and audit cells.
- Uppercase letter-spacing (0.04em–0.08em) used on labels, section headings, and table headers.

### Color Palette

| Token | Value | Usage |
|---|---|---|
| `--color-bg` | `#eef0f5` | Page backgrounds |
| `--color-surface` | `#ffffff` | Cards, panels, modals |
| `--color-surface-2` | `#2a3148` | Secondary surface (dark) |
| `--color-surface-offset` | `#f0f2f8` | Subtle contrast surfaces, table headers |
| `--color-border` | `#dce0ea` | Card/panel borders |
| `--color-divider` | `#e6eaf2` | Internal dividers |
| `--color-text` | `#1b1f30` | Primary text |
| `--color-text-muted` | `#6f758a` | Secondary/meta text |
| `--color-text-faint` | `#979eb6` | Placeholder, disabled text |
| `--color-accent` | `#ee8254` | Primary brand accent (orange) |
| `--color-accent-hover` | `#e2703e` | Accent hover |
| `--color-accent-subtle` | `rgba(238,130,84,0.09)` | Subtle accent backgrounds |
| `--color-success` | `#2fa36a` | Positive states |
| `--color-error` | `#d65f4a` | Negative/error states |
| `--color-warning` | `#d89a2a` | Warning states |
| `--color-blue` | `#6f8fc1` | Informational |
| `--color-sidebar-bg` | `#22283d` | Sidebar background |
| `--color-sidebar-accent` | `#8455ff` | Sidebar accent (purple) |
| `--color-sidebar-icon` | `#a6adc7` | Sidebar icon/text color |

### Spacing Scale
| Token | Value |
|---|---|
| `--space-1` | 0.25rem (4px) |
| `--space-2` | 0.5rem (8px) |
| `--space-3` | 0.75rem (12px) |
| `--space-4` | 1rem (16px) |
| `--space-5` | 1.25rem (20px) |
| `--space-6` | 1.5rem (24px) |
| `--space-8` | 2rem (32px) |
| `--space-10` | 2.5rem (40px) |
| `--space-12` | 3rem (48px) |

### Border Radii
| Token | Value |
|---|---|
| `--radius-sm` | 0.375rem (6px) |
| `--radius-md` | 0.5rem (8px) |
| `--radius-lg` | 0.75rem (12px) |
| `--radius-full` | 9999px (pill/circle) |

### Buttons

**Primary action button** — solid accent background (`color-accent`), white text, 600 weight:
- `padding: 7px 16px` (small), `8px 14px` (medium), `10px 18px` (large)
- `border-radius: var(--radius-sm)` or `var(--radius-md)`
- hover: opacity 0.85–0.9 or `--color-accent-hover`
- disabled: opacity 0.4–0.55, `cursor: not-allowed`

**Secondary/outline button** — light background or transparent, border:
- `background: var(--color-surface-offset)` or `transparent`
- `border: 1px solid var(--color-border)`
- hover: accent border + accent text, or fill with accent

**Danger button** — red (`#dc2626`, `#e74c3c`, `#c0392b`):
- Used for irreversible actions (delete, suspend, cancel).
- Solid or outline variant.

**Success button** — green (`#2ecc71`, `#27ae60`):
- Used for confirming/releasing/resolving actions.

**Icon-only buttons** — 22–32px squares:
- Used for close, delete, edit, pin actions.
- Hover: accent or danger background + color.

**Quick action buttons** — `.dash-quick-btn`:
- Large pill card with icon + label, shadow, lift on hover.

### Form Fields

**Text input** (`.login-input`, `.um-search`, `.tx-search`, `.dp-search`, `.form-input`):
- `padding: 6px 12px` (small), `8px 12px` (standard), `10px 12px` (login)
- `border: 1px solid var(--color-border)`, `border-radius: var(--radius-sm)` or `--radius-md`
- `color: var(--color-text)`, `font-size: var(--text-xs)` or `--text-sm`
- focus: `outline: none; border-color: var(--color-accent); box-shadow: 0 0 0 2px rgba(238,130,84,0.15)`
- placeholder: `var(--color-text-faint)`

**Search input** — positioned icon + padded input:
- Icon absolutely positioned left (10–12px), `pointer-events: none`
- Input has left padding to clear icon (30–32px)
- Focus: accent border, no outline

**Select dropdown** (`.filter-select`, `.dp-filter-select`, `.tx-filter-select`):
- Custom SVG chevron via background-image, `appearance: none`
- `padding: 5px 24px 5px 10px`
- Focus/hover: accent border

**Textarea** — same styling as text input, `resize: vertical`, `font-family: inherit`:
- `min-height: 48px` (notes), `60px` (announcements), `80px` (bulk notifications)

### Icons
- **Lucide React** icon library (v1.14.0).
- Icons are sized 18–24px for nav items, 20–36px for stat card icons, 26–48px for avatar/placeholder icons.
- Sidebar icon size: `--sidebar-icon-size: 20px`.
- Color inherits from parent text.

### Badges / Status Tags

**Badges** (`.badge`):
- `font-size: 11px`, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.3px`
- `padding: 2px 8px`, `border-radius: 4px`
- Semantic colors: green (verified/active), yellow (pending/unverified), red (flagged/error), blue (open/ongoing), gray (archived/new).

**Table badges** (`.badge-table`): 10px, 1px 6px padding.

**Priority badges** (`.badge-priority`): 10px, bold, red for high/critical.

**Status badges** (`.as-status`, `.dp-type-label`, `.tx-type-label`):
- Pill style, 9–10px, uppercase, bold, colored background + border per status.

**Inline stats/kpi trends** (`.kpi-trend`):
- `font-size: 11px`, `font-weight: 600`, `padding: 1px 6px`, `border-radius: 4px`
- `--up`: green (`#27ae60`), `--down`: red (`#e74c3c`)
- Background tinted at 10% opacity.

### Cards

**KPI Card** (`.kpi-card`):
- `background: --color-surface`, `border: 1px solid --color-border`, `border-radius: --radius-lg`
- Accent top border (2px, `--color-accent`, 60% opacity)
- Optional clickable state: hover lifts (`translateY(-1px)`), accent border + shadow
- Alert variant: red border, red background, red accent line

**Section Card** (`.section-card`):
- White surface + border + rounded corners
- Title bar: offset background, uppercase label, bottom border
- Body: padded area

**Stat Card** (`.um-stat-card`, `.tx-stat-card`, `.dp-stat-card`, `.as-stat`):
- Surface + border + rounded corners
- Label (uppercase, muted, 500 weight) + value (xl, bold, tabular-nums) + optional sub text
- Clickable variant: hover lift, accent border, shadow

### Tables
- Full-width, collapsed borders, striped off-white headers.
- Header cells: uppercase, 600 weight, `letter-spacing: 0.05em`, `font-size: var(--text-xs)`.
- Body cells: `font-size: var(--text-xs)`, bottom border divider.
- Row hover: `#e8eaef` background.
- Clickable rows: `cursor: pointer`, `focus-visible: 2px accent outline`.
- Sortable headers: `.um-detail-sortable-th`, active sort highlighted in accent color.
- Table wrapper: `overflow-x: auto` for horizontal scroll.

### Modals & Overlays

**Confirm dialog** (`.confirm-overlay` + `.confirm-dialog`):
- Fixed overlay, `background: rgba(0,0,0,0.55)`, `z-index: 2000`.
- Dialog: 400px max, white surface, rounded, fade + slide-in animation.
- Icon (danger/warning/info) + title + message + cancel/action buttons.

**Slide-out panel** (`.dp-slide-panel`):
- Fixed right panel, 720px wide, full height, slide-in from right (250ms).
- Header + scrollable body + sections + bottom actions.

**Transaction modal** (`.tx-modal`):
- Centered overlay, 640px max, slide-up animation (200ms).
- Sections: header, amounts, parties, job info, admin actions, internal notes.

**Detail modal** (`.um-detail-modal`):
- 960px max, scrollable, centered, layered shadow.

**Compose modal** (`.msg-modal`):
- 480px, top-anchored (80px from top), slide-up, user picker list.

### Loading States
- **Skeleton table** (`.sk-table`): shimmer animation (1.5s) using gradient background for rows/cells.
- **Skeleton cards** (`.sk-card`): placeholder card shapes.
- **Inline spinner** (`.sk-spinner`): 16px rotating border ring, accent color.

### Empty States
- Centered column, large icon wrapper (72px circle), title, description (max 320px), optional CTA button.
- Used across all list pages when no data matches filters.

### Toast Notifications
- Fixed top-right container (`.toast-container`), `z-index: 10000`, 380px max-width.
- Slide-in from right (220ms), icon + message + close button.
- Variants: success (green), error (red), warning (yellow), info (blue).
- Also bottom-positioned variant (`.dp-toast`, `.tx-toast`) with slide-up animation.

## Interaction States

| Element | Default | Hover | Active/Focus | Disabled |
|---|---|---|---|---|
| Primary button | `--color-accent` bg, white text | `opacity: 0.9` or `--accent-hover` | — | `opacity: 0.4–0.55`, `cursor: not-allowed` |
| Secondary button | Surface offset bg, border | Accent border + text or accent fill | — | `opacity: 0.35`, `cursor: not-allowed` |
| Sidebar nav item | `--sidebar-icon` color | Purple tint bg, white text | Deeper purple bg, white text | — |
| KPI card | White bg, subtle shadow | Lift 1px, accent border + deeper shadow | `translateY(0)` on click | — |
| Input field | Border `--color-border` | — | Accent border + `box-shadow` (2px accent glow) | — |
| Table row | — | `#e8eaef` bg | `#d8dce7` on `:active` | — |
| Toast close button | Faint text | Surface offset bg, darker text | — | — |
| Pin/icon button | Hidden/faint, bg `rgba(255,255,255,0.04)` | `bg rgba(255,255,255,0.12)`, white text | — | — |
| Slider arrow | Border, light bg | Accent border + shadow | `scale(0.92)` | `opacity: 0.3`, no pointer events |
| Chat send button | Accent circle | `scale(1.05)`, darker accent | — | `opacity: 0.4` |
| Item with hover actions (e.g., note delete) | Action hidden (`opacity: 0`) | Action visible (`opacity: 1`) | — | — |

### Focus-visible
Interactive elements consistently use `outline: 2px solid var(--color-accent)` for keyboard focus, with `outline-offset` varying (0–2px) per context.

### Transitions
Global default: `180ms cubic-bezier(0.16, 1, 0.3, 1)` (stored as `--transition`). Used for color, background, border-color, opacity, transform changes.

## Component Hierarchy

```
App (BrowserRouter)
└── Providers (Auth, Toast, etc.)
    └── AppRouter (Routes)
        ├── LoginPage
        ├── ProtectedPagesLayout (DateRangeProvider + domain providers)
        │   ├── AppLayout
        │   │   ├── Sidebar
        │   │   │   ├── Logo + Wordmark + Pin Button
        │   │   │   ├── User Info (avatar, name, role)
        │   │   │   ├── Nav Section: General
        │   │   │   │   ├── NavItem: Dashboard
        │   │   │   │   ├── NavItem: Users (admin)
        │   │   │   │   ├── NavItem: Jobs (all)
        │   │   │   │   ├── NavItem: Listings (admin)
        │   │   │   │   └── NavItem: Transactions (admin)
        │   │   │   ├── Nav Section: Support
        │   │   │   │   ├── NavItem: Disputes (staff)
        │   │   │   │   ├── NavItem: Messages (staff)
        │   │   │   │   └── NavItem: Reviews (admin)
        │   │   │   ├── Nav Section: Platform
        │   │   │   │   ├── NavItem: Assessments
        │   │   │   │   ├── NavItem: Notifications (staff)
        │   │   │   │   ├── NavItem: Support Hub (all)
        │   │   │   │   └── NavItem: Settings (admin)
        │   │   │   └── NavItem: Logout
        │   │   └── main.app-main
        │   │       └── ProtectedRoute (role-based)
        │   │           └── Page Component
        │   │               ├── DashboardPage
        │   │               │   ├── DashHeader (title + filter badges + export)
        │   │               │   ├── DashQuickActions
        │   │               │   ├── DashGrid
        │   │               │   │   ├── OverviewSection
        │   │               │   │   │   ├── KPI Groups (kpi-row → KPICard[])
        │   │               │   │   │   ├── Charts Row (recharts)
        │   │               │   │   │   └── Metrics Row
        │   │               │   │   └── DashSide
        │   │               │   │       ├── SectionCard (recent activity)
        │   │               │   │       ├── SectionCard (pending items)
        │   │               │   │       └── SectionCard (conversion funnel)
        │   │               │   └── DateRangeStatusBar
        │   │               ├── UsersPage / JobsPage / etc.
        │   │               │   ├── PageHead (title + archive toggle)
        │   │               │   ├── StatsRow (stat cards)
        │   │               │   ├── Panel
        │   │               │   │   ├── Filters (selects + date)
        │   │               │   │   ├── SearchBar
        │   │               │   │   ├── TableWrap
        │   │               │   │   │   └── Table (sortable headers + rows + badges)
        │   │               │   │   └── Pagination
        │   │               │   └── (Sidebar card for Jobs/Listings)
        │   │               ├── DetailPage
        │   │               │   ├── Toolbar (back + breadcrumbs)
        │   │               │   ├── HeaderCard (avatar + info grid)
        │   │               │   ├── Stats (3 navy cards)
        │   │               │   ├── Body
        │   │               │   │   ├── Main (tabs, tables, notes, sections)
        │   │               │   │   └── Sidebar (status, metadata, actions)
        │   │               │   └── Modals (confirm, lightbox, notes, delete)
        │   │               └── SettingsPage
        │   │                   └── SettingsGrid
        │   │                       └── SettingsSection[]
        │   │                           └── SettingRow[] (label + description + control)
        │   └── ToastContainer (fixed, top-right)
        └── NotFoundPage
```

## Accessibility Considerations

1. **Focus indicators**: All interactive elements show `2px solid --color-accent` outline on `:focus-visible`.
2. **Color contrast**: Text colors pass contrast against surfaces (`#1b1f30` on `#ffffff` = ~14:1; `#6f758a` on `#ffffff` = ~4.5:1).
3. **Semantic HTML**: Buttons use `<button>`, links use `<a>`, forms use `<label>`, tables use `<thead>`/`<tbody>`/`<th>`.
4. **Screen-reader hidden**: `.um-detail-sr-only` class for visually hidden labels.
5. **Touch targets**: Mobile sidebar items are at least 28px; buttons are 28–38px minimum.
6. **Reduced motion**: Animations use `prefers-reduced-motion` compatible timing (transitions are 150–250ms).
7. **ARIA attributes**: Modals and overlays use semantic structure with close buttons and proper focus management.
8. **Color-coding**: Badges and KPIs never rely on color alone; status text labels are present.
9. **Forms**: Inputs have associated labels, `::placeholder` provides hints, validation shown inline.
10. **Keyboard navigation**: Sortable columns, pagination buttons, tab rows, and nav items are keyboard accessible.

## Consistency Guidelines

1. **Naming convention**: All CSS classes use kebab-case with domain-specific prefixes (`um-`, `dp-`, `tx-`, `as-`, `msg-`, `notif-`, `ann-`, `bn-`, `sk-`).
2. **Layout anatomy**: Every list page follows: `page-head → stats → panel(filters + search + table + pagination)`. Detail pages follow: `toolbar → header → stats → body(main + sidebar)`.
3. **CSS custom properties**: Design tokens are centralized in `:root` under `index.css`. No hardcoded values except for unique component colors. All components reference these tokens.
4. **Spacing**: Use `--space-*` tokens exclusively. Never use arbitrary pixel values for margins/padding.
5. **Typography**: Only Satoshi/Inter for body; monospace for IDs, codes, audit data. Uppercase + letter-spacing reserved for labels and section titles.
6. **Interactive states**: Every clickable element has hover, focus-visible, and (where applicable) active/disabled states. Use `--transition` for smooth transitions.
7. **Card styles**: KPI cards, stat cards, and section cards share `--color-surface` background, `--color-border` border, and `--radius-lg` rounding.
8. **Accent color**: `--color-accent` (#ee8254) is the single primary action color. Purple (#8455ff) is reserved for sidebar accents. Never mix multiple accent colors.
9. **Semantic colors**: Green = success/positive, Red = error/danger/negative, Yellow/amber = warning/pending, Blue = informational/open.
10. **Modal patterns**: Overlays use `rgba(0,0,0,0.45–0.55)` backdrop. Dialogs use `--color-surface` background with `--radius-lg` (12px) rounding and subtle border.
11. **Data tables**: Always include table wrapper (`overflow-x: auto`), sticky headers, sortable column headers with arrow indicators, pagination with prev/next + page info.
12. **Responsive behavior**: Sidebar collapses at 768px to bottom nav; stat grids reduce columns; padding shrinks; detail layouts stack.
13. **Loading states**: Use skeleton shimmer for initial loads, inline spinner for in-place loading, and empty state components for zero-data scenarios.
14. **Badges**: Use the centralized `.badge` system with status variant classes. Never create ad-hoc colored labels outside this system.

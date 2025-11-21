import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  Heart,
  HeartPlus,
  LocateFixed,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  Search,
  Settings,
  TramFront,
  UserRound,
} from 'lucide-react'
import './SideMenu.css'
import { FAVORITES_STORAGE_KEY } from '../constants/storageKeys'

export type DisplayToggleId = 'location' | 'allRoutes' | 'favoriteRoutes'
export type DisplayToggleState = Record<DisplayToggleId, boolean>
export type RouteListItem = {
  id: string
  name: string
}

type SideMenuProps = {
  isOpen: boolean
  onToggle: () => void
  displayToggles: DisplayToggleState
  onDisplayToggleChange: (id: DisplayToggleId) => void
  onFavoritesChange?: (ids: string[]) => void
  activeRouteIds: string[]
  onActiveRouteToggle: (id: string) => void
  onClearActiveRoutes?: () => void
  routes?: RouteListItem[]
  allRoutesCount?: number | null
}

type DisplayOption = {
  id: DisplayToggleId
  label: string
  icon: ReactNode
}

const routeIcon = <Route aria-hidden="true" focusable="false" />
const brandIcon = <TramFront aria-hidden="true" focusable="false" />

const displayOptionsConfig: DisplayOption[] = [
  {
    id: 'location',
    label: 'Show my location',
    icon: <LocateFixed aria-hidden="true" focusable="false" />,
  },
  {
    id: 'allRoutes',
    label: 'Show all routes',
    icon: <Route aria-hidden="true" focusable="false" />,
  },
  {
    id: 'favoriteRoutes',
    label: 'Show favorite routes',
    icon: <Heart aria-hidden="true" focusable="false" />,
  },
]

const fallbackRoutes: RouteListItem[] = [
  { id: '3', name: '3 - King Drive' },
  { id: '6', name: '6 - Jackson Park Express' },
  { id: '8', name: '8 - Halsted' },
  { id: '9', name: '9 - Ashland' },
  { id: '22', name: '22 - Clark' },
  { id: '29', name: '29 - State' },
  { id: '36', name: '36 - Broadway' },
  { id: '49', name: '49 - Western' },
  { id: '53', name: '53 - Pulaski' },
  { id: '55', name: '55 - Garfield' },
  { id: '60', name: '60 - Blue Island/26th' },
  { id: '66', name: '66 - Chicago' },
  { id: '151', name: '151 - Sheridan' },
]

const SideMenu = ({
  isOpen,
  onToggle,
  displayToggles,
  onDisplayToggleChange,
  onFavoritesChange,
  activeRouteIds,
  onActiveRouteToggle,
  onClearActiveRoutes,
  routes,
  allRoutesCount,
}: SideMenuProps) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set(['8'])
    try {
      const stored = window.localStorage.getItem(FAVORITES_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return new Set(parsed)
        }
      }
    } catch {
      // ignore parse errors and fall back to default
    }
    return new Set(['8'])
  })

  const [isFavoritesOpen, setIsFavoritesOpen] = useState(true)
  const [isAllRoutesOpen, setIsAllRoutesOpen] = useState(true)

  const availableRoutes = routes && routes.length > 0 ? routes : fallbackRoutes

  const filteredRoutes = useMemo(() => {
    if (!searchQuery.trim()) return availableRoutes
    return availableRoutes.filter((route) =>
      route.name.toLowerCase().includes(searchQuery.toLowerCase()),
    )
  }, [searchQuery, availableRoutes])

  const favoriteRoutes = useMemo(
    () => availableRoutes.filter((route) => favorites.has(route.id)),
    [favorites, availableRoutes],
  )

  const activeRouteSet = useMemo(() => new Set(activeRouteIds), [activeRouteIds])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify(Array.from(favorites)),
    )
  }, [favorites])

  useEffect(() => {
    if (onFavoritesChange) {
      onFavoritesChange(Array.from(favorites))
    }
  }, [favorites, onFavoritesChange])

  const toggleFavorite = (routeId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(routeId)) {
        next.delete(routeId)
      } else {
        next.add(routeId)
      }
      return next
    })
  }

  const toggleActiveRoute = (routeId: string) => {
    onActiveRouteToggle(routeId)
  }

  return (
    <aside className={`side-menu ${isOpen ? 'side-menu--open' : ''}`}>
        <header className="side-menu__header">
          <div className="side-menu__brand-icon" aria-hidden="true">
            {brandIcon}
          </div>
          <div>
            <p className="side-menu__eyebrow">Chicago</p>
            <h1>CTA Map</h1>
          </div>
        </header>

        <label className="side-menu__search" aria-label="Search for a route">
          <span aria-hidden="true" className="side-menu__search-icon">
            <Search aria-hidden="true" focusable="false" />
          </span>
          <input
            type="search"
            placeholder="Search for a route..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>

        <section className="side-menu__section">
          <h2>Display options</h2>
          <ul>
            {displayOptionsConfig.map((option) => {
              const isBlocked =
                (option.id === 'allRoutes' && displayToggles.favoriteRoutes) ||
                (option.id === 'favoriteRoutes' && displayToggles.allRoutes)
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    className="side-menu__toggle"
                    onClick={() => onDisplayToggleChange(option.id)}
                    aria-pressed={displayToggles[option.id]}
                    disabled={isBlocked}
                  >
                    <span className="side-menu__toggle-icon">{option.icon}</span>
                    <span className="side-menu__toggle-label">{option.label}</span>
                    <span
                      className={`side-menu__switch ${displayToggles[option.id] ? 'is-on' : ''}`}
                      aria-hidden="true"
                    >
                      <span className="side-menu__switch-thumb" />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <p className="side-menu__selected-routes" aria-live="polite">
          Selected routes <span data-testid="selected-routes-count">{activeRouteIds.length}</span>
          {onClearActiveRoutes && activeRouteIds.length > 0 && (
            <button
              type="button"
              className="side-menu__clear-selected"
              onClick={onClearActiveRoutes}
              aria-label="Deselect all selected routes"
              title="Deselect all selected routes"
            >
              <Minus aria-hidden="true" focusable="false" />
            </button>
          )}
        </p>

        <section className="side-menu__section">
          <div className="side-menu__section-heading side-menu__section-heading--collapsible">
            <h2>Favorites</h2>
            <span className="side-menu__section-pill" data-testid="favorites-count">
              {favoriteRoutes.length}
            </span>
            <button
              type="button"
              className={`side-menu__collapse-toggle ${isFavoritesOpen ? 'is-open' : ''}`}
              onClick={() => setIsFavoritesOpen((prev) => !prev)}
              aria-expanded={isFavoritesOpen}
            >
              <ChevronDown aria-hidden="true" focusable="false" />
            </button>
          </div>
          {isFavoritesOpen && (
            <ul data-testid="favorites-list">
              {favoriteRoutes.map((route) => (
                <li key={route.id}>
                  <button
                    type="button"
                    className={`side-menu__route ${activeRouteSet.has(route.id) ? 'is-active' : ''}`}
                    aria-pressed={activeRouteSet.has(route.id)}
                    onClick={() => toggleActiveRoute(route.id)}
                    data-testid="route-button"
                    data-route-id={route.id}
                  >
                    <span className="side-menu__route-icon">{routeIcon}</span>
                    <span className="side-menu__route-label">{route.name}</span>
                    <span
                      className={`side-menu__favorite ${favorites.has(route.id) ? 'is-active' : ''}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleFavorite(route.id)
                      }}
                      data-testid="favorite-toggle"
                      data-route-id={route.id}
                    >
                      {favorites.has(route.id) ? (
                        <Heart aria-hidden="true" focusable="false" />
                      ) : (
                        <HeartPlus aria-hidden="true" focusable="false" />
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="side-menu__section">
          <div className="side-menu__section-heading side-menu__section-heading--collapsible">
            <h2>All routes</h2>
            <span className="side-menu__section-pill">
              {typeof allRoutesCount === 'number' ? allRoutesCount : '...'}
            </span>
            <button
              type="button"
              className={`side-menu__collapse-toggle ${isAllRoutesOpen ? 'is-open' : ''}`}
              onClick={() => setIsAllRoutesOpen((prev) => !prev)}
              aria-expanded={isAllRoutesOpen}
            >
              <ChevronDown aria-hidden="true" focusable="false" />
            </button>
          </div>
          {isAllRoutesOpen && (
            <div className="side-menu__routes-list" role="region" aria-label="All CTA routes">
              <ul data-testid="all-routes-list">
                {filteredRoutes.map((route) => (
                  <li key={route.id}>
                    <button
                      type="button"
                      className={`side-menu__route ${activeRouteSet.has(route.id) ? 'is-active' : ''}`}
                      aria-pressed={activeRouteSet.has(route.id)}
                      onClick={() => toggleActiveRoute(route.id)}
                      data-testid="route-button"
                      data-route-id={route.id}
                    >
                      <span className="side-menu__route-icon">{routeIcon}</span>
                      <span className="side-menu__route-label">{route.name}</span>
                      <span
                        className={`side-menu__favorite ${favorites.has(route.id) ? 'is-active' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleFavorite(route.id)
                        }}
                        data-testid="favorite-toggle"
                        data-route-id={route.id}
                      >
                        {favorites.has(route.id) ? (
                          <Heart aria-hidden="true" focusable="false" />
                        ) : (
                          <HeartPlus aria-hidden="true" focusable="false" />
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="side-menu__section side-menu__section--user">
          <button type="button" className="side-menu__user-link">
            <UserRound aria-hidden="true" focusable="false" />
            Login
          </button>
          <button type="button" className="side-menu__user-link">
            <Settings aria-hidden="true" focusable="false" />
            Settings
          </button>
          <button type="button" className="side-menu__user-link" onClick={onToggle}>
            {isOpen ? (
              <PanelLeftClose aria-hidden="true" focusable="false" />
            ) : (
              <PanelLeftOpen aria-hidden="true" focusable="false" />
            )}
            {isOpen ? 'Collapse' : 'Expand'}
          </button>
        </section>
    </aside>
  )
}

export default SideMenu

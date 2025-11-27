import { useEffect, useMemo, useState } from 'react'
import { Table, TextInput, Paper, Text, Anchor, UnstyledButton, Badge, Group, Pagination, Button } from '@mantine/core'
import { useRouteStatsQuery } from '../hooks/ctaQueries'

type SortField = 'routeNumber' | 'routeName' | 'totalActive'
type SortDirection = 'asc' | 'desc'

const ITEMS_PER_PAGE = 10

const StatsPage = () => {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('routeNumber')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [showAllActive, setShowAllActive] = useState(false)
  const statsQuery = useRouteStatsQuery()

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection(field === 'totalActive' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const routeStats = statsQuery.data ?? []

  const filteredStats = useMemo(() => {
    let result = routeStats
    if (search.trim()) {
      const term = search.toLowerCase()
      result = result.filter(
        (r) =>
          r.routeNumber.toLowerCase().includes(term) || r.routeName.toLowerCase().includes(term)
      )
    }

    return [...result].sort((a, b) => {
      const modifier = sortDirection === 'asc' ? 1 : -1
      if (sortField === 'routeNumber') {
        return modifier * a.routeNumber.localeCompare(b.routeNumber, undefined, { numeric: true })
      }
      if (sortField === 'routeName') {
        return modifier * a.routeName.localeCompare(b.routeName)
      }
      if (sortField === 'totalActive') {
        return modifier * (a.totalActive - b.totalActive)
      }
      return 0
    })
  }, [routeStats, search, sortField, sortDirection])

  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(interval)
  }, [statsQuery.dataUpdatedAt])

  const lastUpdated = statsQuery.dataUpdatedAt
  const secondsAgo = lastUpdated ? Math.max(0, Math.round((now - lastUpdated) / 1000)) : null
  const lastUpdatedText = (() => {
    if (secondsAgo === null) return 'Loading...'
    if (secondsAgo === 0) return 'just now'
    if (secondsAgo < 60) return `${secondsAgo} second${secondsAgo === 1 ? '' : 's'} ago`
    const minutes = Math.floor(secondsAgo / 60)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  })()

  const totalPages = Math.ceil(filteredStats.length / ITEMS_PER_PAGE)
  const paginatedStats = filteredStats.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  )

  const rows = paginatedStats.map((stat) => (
    <Table.Tr key={stat.routeNumber}>
      <Table.Td>
        <Anchor
          href={`https://www.transitchicago.com/bus/${stat.routeNumber.toLowerCase()}/`}
          target="_blank"
          c="blue.4"
          fw={500}
        >
          #{stat.routeNumber}
        </Anchor>
      </Table.Td>
      <Table.Td>{stat.routeName}</Table.Td>
      <Table.Td ta="center">{stat.northEastbound}</Table.Td>
      <Table.Td ta="center">{stat.southWestbound}</Table.Td>
      <Table.Td ta="center" fw={600}>
        {stat.totalActive}
      </Table.Td>
    </Table.Tr>
  ))

  const activeRouteNumbers = routeStats
    .filter((route) => route.totalActive > 0)
    .map((route) => route.routeNumber)

  const totalBusesOnRoad = routeStats.reduce((sum, route) => sum + route.totalActive, 0)

  const ACTIVE_ROUTES_LIMIT = 10
  const displayedActiveRoutes = showAllActive
    ? activeRouteNumbers
    : activeRouteNumbers.slice(0, ACTIVE_ROUTES_LIMIT)
  const hasMoreActiveRoutes = activeRouteNumbers.length > ACTIVE_ROUTES_LIMIT

  return (
    <main className="stats-page">
      <h1>Route Statistics & Ridership</h1>
      <Text c="dimmed" mb="xs">
        Live data and analytics for Chicago's bus network.
      </Text>
      <Text c="dimmed" size="sm" mb="lg">
        Last updated: {lastUpdatedText}
      </Text>

      <div className="stats-page__content">
        <Paper p="md" radius="md" withBorder className="stats-page__table-section">
          <Text fw={600} size="lg" mb="md">
            Comprehensive Route Status
          </Text>
          <TextInput
            placeholder="Search by route number or name"
            value={search}
            onChange={(e) => handleSearch(e.currentTarget.value)}
            mb="md"
          />
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>
                  <UnstyledButton
                    onClick={() => handleSort('routeNumber')}
                    className={`sortable-header ${sortField === 'routeNumber' ? 'sortable-header--active' : ''}`}
                  >
                    Route # {sortField === 'routeNumber' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </UnstyledButton>
                </Table.Th>
                <Table.Th>
                  <UnstyledButton
                    onClick={() => handleSort('routeName')}
                    className={`sortable-header ${sortField === 'routeName' ? 'sortable-header--active' : ''}`}
                  >
                    Route Name {sortField === 'routeName' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </UnstyledButton>
                </Table.Th>
                <Table.Th ta="center">North/Eastbound</Table.Th>
                <Table.Th ta="center">South/Westbound</Table.Th>
                <Table.Th ta="center">
                  <UnstyledButton
                    onClick={() => handleSort('totalActive')}
                    className={`sortable-header ${sortField === 'totalActive' ? 'sortable-header--active' : ''}`}
                  >
                    Total Active {sortField === 'totalActive' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </UnstyledButton>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{rows}</Table.Tbody>
          </Table>
          {totalPages > 1 && (
            <Group justify="center" mt="md">
              <Pagination total={totalPages} value={page} onChange={setPage} />
            </Group>
          )}
        </Paper>

        <div className="stats-page__sidebar">
          <Paper p="md" radius="md" withBorder mb="md">
            <Text fw={600} size="xl">
              {totalBusesOnRoad.toLocaleString()} Buses on the Road
            </Text>
          </Paper>

          <Paper p="md" radius="md" withBorder>
            <Text fw={600} size="lg" mb="md">
              {activeRouteNumbers.length} Routes Active Right Now
            </Text>
            <Group gap="xs">
              {displayedActiveRoutes.map((routeNum) => (
                <Badge key={routeNum} variant="outline" color="blue" size="lg">
                  #{routeNum}
                </Badge>
              ))}
            </Group>
            {hasMoreActiveRoutes && (
              <Button
                variant="subtle"
                size="sm"
                mt="md"
                onClick={() => setShowAllActive((prev) => !prev)}
              >
                {showAllActive
                  ? 'Show less'
                  : `Show all ${activeRouteNumbers.length} routes`}
              </Button>
            )}
          </Paper>
        </div>
      </div>
    </main>
  )
}

export default StatsPage

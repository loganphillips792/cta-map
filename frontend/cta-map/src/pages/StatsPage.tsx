import { useEffect, useMemo, useState } from 'react'
import { Table, TextInput, Paper, Text, Anchor, UnstyledButton, Badge, Group, Pagination, Button, Select, Skeleton } from '@mantine/core'
import ReactECharts from 'echarts-for-react'
import { useRouteStatsQuery, useRidershipYearsQuery, useRidershipYearlyQuery, useRidershipMonthlyQuery, useRidershipDailyQuery } from '../hooks/ctaQueries'

type SortField = 'routeNumber' | 'routeName' | 'totalActive'
type SortDirection = 'asc' | 'desc'

const ITEMS_PER_PAGE = 10

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const StatsPage = () => {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('routeNumber')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [showAllActive, setShowAllActive] = useState(false)
  const [selectedYear, setSelectedYear] = useState<string | null>('all')
  const [selectedDailyYear, setSelectedDailyYear] = useState<string | null>('all')
  const [selectedDailyMonth, setSelectedDailyMonth] = useState<string | null>('all')

  const statsQuery = useRouteStatsQuery()
  const yearsQuery = useRidershipYearsQuery()
  const yearlyQuery = useRidershipYearlyQuery()
  const monthlyQuery = useRidershipMonthlyQuery(selectedYear !== 'all' ? Number(selectedYear) : null)
  const dailyQuery = useRidershipDailyQuery(
    selectedDailyYear !== 'all' ? Number(selectedDailyYear) : undefined,
    selectedDailyMonth !== 'all' ? Number(selectedDailyMonth) : undefined
  )

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

  const yearSelectData = useMemo(() => {
    const years = yearsQuery.data ?? []
    return [
      { value: 'all', label: 'All Years' },
      ...years.map((y) => ({ value: String(y), label: String(y) })).reverse(),
    ]
  }, [yearsQuery.data])

  const dailyYearSelectData = useMemo(() => {
    const years = yearsQuery.data ?? []
    return [
      { value: 'all', label: 'All Years' },
      ...years.map((y) => ({ value: String(y), label: String(y) })).reverse(),
    ]
  }, [yearsQuery.data])

const monthSelectData = [
    { value: 'all', label: 'All Months' },
    ...MONTH_NAMES.map((name, idx) => ({
      value: String(idx + 1),
      label: name,
    })),
]

  const ridershipChartOptions = useMemo(() => {
    if (selectedYear === 'all') {
      const data = yearlyQuery.data ?? []
      return {
        tooltip: {
          trigger: 'axis',
          formatter: (params: { name: string; value: number }[]) => {
            const p = params[0]
            return `${p.name}<br/>Rides: ${p.value.toLocaleString()}`
          },
        },
        xAxis: {
          type: 'category',
          data: data.map((d) => d.year),
          axisLabel: { color: '#aaa' },
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            color: '#aaa',
            formatter: (value: number) => {
              if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
              if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`
              if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
              return value
            },
          },
        },
        series: [
          {
            type: 'bar',
            data: data.map((d) => d.rides),
            itemStyle: { color: '#228be6' },
          },
        ],
        grid: { left: 60, right: 20, top: 20, bottom: 40 },
      }
    } else {
      const data = monthlyQuery.data ?? []
      return {
        tooltip: {
          trigger: 'axis',
          formatter: (params: { name: string; value: number }[]) => {
            const p = params[0]
            return `${p.name} ${selectedYear}<br/>Rides: ${p.value.toLocaleString()}`
          },
        },
        xAxis: {
          type: 'category',
          data: data.map((d) => MONTH_NAMES[d.month - 1]),
          axisLabel: { color: '#aaa' },
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            color: '#aaa',
            formatter: (value: number) => {
              if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
              if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`
              if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
              return value
            },
          },
        },
        series: [
          {
            type: 'bar',
            data: data.map((d) => d.rides),
            itemStyle: { color: '#228be6' },
          },
        ],
        grid: { left: 60, right: 20, top: 20, bottom: 40 },
      }
    }
  }, [selectedYear, yearlyQuery.data, monthlyQuery.data])

  const dailyChartOptions = useMemo(() => {
    const data = dailyQuery.data ?? []
    const showingAllData = selectedDailyYear === 'all' && selectedDailyMonth === 'all'
    const showingYearOnly = selectedDailyYear !== 'all' && selectedDailyMonth === 'all'

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: { name: string; value: number }[]) => {
          const p = params[0]
          return `${p.name}<br/>Rides: ${p.value.toLocaleString()}`
        },
      },
      xAxis: {
        type: 'category',
        data: data.map((d) => {
          const date = new Date(d.date)
          if (showingAllData) {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          } else if (showingYearOnly) {
            return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`
          }
          return date.getDate()
        }),
        axisLabel: {
          color: '#aaa',
          rotate: showingAllData || showingYearOnly ? 45 : 0,
          interval: showingAllData ? Math.floor(data.length / 20) : showingYearOnly ? Math.floor(data.length / 12) : 'auto',
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#aaa',
          formatter: (value: number) => {
            if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
            if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`
            if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
            return value
          },
        },
      },
      dataZoom: showingAllData || showingYearOnly ? [
        {
          type: 'inside',
          start: 0,
          end: 100,
        },
        {
          type: 'slider',
          start: 0,
          end: 100,
        },
      ] : undefined,
      series: [
        {
          type: 'line',
          data: data.map((d) => d.rides),
          itemStyle: { color: '#40c057' },
          areaStyle: { color: 'rgba(64, 192, 87, 0.2)' },
          showSymbol: !showingAllData,
        },
      ],
      grid: { left: 60, right: 20, top: 20, bottom: showingAllData || showingYearOnly ? 80 : 50 },
    }
  }, [dailyQuery.data, selectedDailyYear, selectedDailyMonth])

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
          {statsQuery.isLoading ? (
            <>
              {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
                <Skeleton key={i} height={40} mb="xs" />
              ))}
            </>
          ) : (
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
          )}
          {totalPages > 1 && (
            <Group justify="center" mt="md">
              <Pagination total={totalPages} value={page} onChange={setPage} />
            </Group>
          )}
        </Paper>

        <div className="stats-page__sidebar">
          <Paper p="md" radius="md" withBorder mb="md">
            {statsQuery.isLoading ? (
              <Skeleton height={28} width="60%" />
            ) : (
              <Text fw={600} size="xl">
                {totalBusesOnRoad.toLocaleString()} Buses on the Road
              </Text>
            )}
          </Paper>

          <Paper p="md" radius="md" withBorder>
            {statsQuery.isLoading ? (
              <>
                <Skeleton height={24} width="70%" mb="md" />
                <Group gap="xs">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} height={26} width={50} radius="xl" />
                  ))}
                </Group>
              </>
            ) : (
              <>
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
              </>
            )}
          </Paper>
        </div>
      </div>

      <Paper p="md" radius="md" withBorder mt="lg">
        <Group justify="space-between" mb="md">
          <Text fw={600} size="lg">
            Historical Ridership
          </Text>
          <Select
            value={selectedYear}
            onChange={setSelectedYear}
            data={yearSelectData}
            w={150}
          />
        </Group>
        {(selectedYear === 'all' ? yearlyQuery.isLoading : monthlyQuery.isLoading) ? (
          <Skeleton height={350} />
        ) : (
          <ReactECharts
            option={ridershipChartOptions}
            style={{ height: 350 }}
            opts={{ renderer: 'svg' }}
          />
        )}
      </Paper>

      <Paper p="md" radius="md" withBorder mt="lg">
        <Group justify="space-between" mb="md">
          <Text fw={600} size="lg">
            Daily Ridership
          </Text>
          <Group gap="sm">
            <Select
              value={selectedDailyYear}
              onChange={setSelectedDailyYear}
              data={dailyYearSelectData}
              w={130}
            />
            <Select
              value={selectedDailyMonth}
              onChange={setSelectedDailyMonth}
              data={monthSelectData}
              w={130}
            />
          </Group>
        </Group>
        {dailyQuery.isLoading ? (
          <Skeleton height={400} />
        ) : (
          <ReactECharts
            option={dailyChartOptions}
            style={{ height: 400 }}
            opts={{ renderer: 'svg' }}
          />
        )}
      </Paper>
    </main>
  )
}

export default StatsPage

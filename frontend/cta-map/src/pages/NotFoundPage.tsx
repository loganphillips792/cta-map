import { Link } from 'react-router-dom'
import { Paper, Text, Button } from '@mantine/core'

const NotFoundPage = () => {
  return (
    <main className="not-found-page">
      <Paper p="xl" radius="md" withBorder ta="center">
        <Text fw={700} size="xl" mb="md">
          404 - Page Not Found
        </Text>
        <Text c="dimmed" mb="lg">
          The page you're looking for doesn't exist.
        </Text>
        <Button component={Link} to="/map" variant="filled">
          Go to Map
        </Button>
      </Paper>
    </main>
  )
}

export default NotFoundPage

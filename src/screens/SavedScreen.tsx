import { Bookmark } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { ParkingCard } from '@/components/parking/ParkingCard'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { useToast } from '@/components/ui/Toast'
import { listSaved, removeSaved, type SavedParking } from '@/lib/saved'
import type { ParkingSpace } from '@/types'

function toParkingSpace(saved: SavedParking): ParkingSpace {
  return {
    ...saved,
    description: null,
    payment_recipient_address: '',
    active: true,
    created_at: '',
    updated_at: '',
  }
}

export function SavedScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const [items, setItems] = useState<SavedParking[]>([])

  const load = useCallback(() => setItems(listSaved()), [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <AppShell showNav title="Saved">
      {items.length === 0 ? (
        <EmptyState
          icon={<Bookmark className="size-5" />}
          title="No saved places"
          description="Tap the bookmark on any parking space to save it here."
          action={
            <Button size="md" onClick={() => navigate('/')}>
              Find parking
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((saved) => (
            <SwipeToDelete
              key={saved.id}
              label="Remove"
              onDelete={() => {
                removeSaved(saved.id)
                load()
                toast.show('Removed from saved.')
              }}
            >
              <ParkingCard
                space={toParkingSpace(saved)}
                onSelect={(space) => {
                  load()
                  navigate(`/parking/${space.id}`)
                }}
              />
            </SwipeToDelete>
          ))}
        </div>
      )}
    </AppShell>
  )
}

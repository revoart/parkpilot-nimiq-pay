import { Heart, MapPin } from 'lucide-react'
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
          icon={<Heart className="size-6" />}
          title="No saved listings"
          description="Tap the heart on any listing to save it for later."
          action={
            <Button full variant="secondary" size="md" onClick={() => navigate('/')}>
              <MapPin className="mr-2 size-4" />
              Explore Parking
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((saved) => (
            <SwipeToDelete
              key={saved.id}
              label="Remove"
              className="shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
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

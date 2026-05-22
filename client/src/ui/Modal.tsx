import type { ModalType } from '@asura/shared'
import { InventoryModal } from './modals/InventoryModal'
import { CraftModal } from './modals/CraftModal'
import { EnhanceModal } from './modals/EnhanceModal'
import { ClassChangeModal } from './modals/ClassChangeModal'
import { ShopModal } from './modals/ShopModal'
import { HelpModal } from './modals/HelpModal'
import { RaceChangeModal } from './modals/RaceChangeModal'
import { StatusModal } from './modals/StatusModal'
import { ClassChoiceModal } from './modals/ClassChoiceModal'

interface Props {
  type: ModalType
  onClose: () => void
}

const titles: Record<Exclude<ModalType, 'none'>, string> = {
  inventory:      '🎒 ไอเท็ม',
  craft:          '⚒ คราฟอาวุธ / เกราะ',
  enhance:        '✨ ตีบวกอาวุธ',
  'class-change': '🔄 เปลี่ยนอาชีพ',
  shop:           '💊 ร้านค้าหมู่บ้าน',
  help:           '❓ วิธีเล่น',
  'race-change':  '✨ เควสเปลี่ยนเผ่า',
  status:         '📊 สเตตัส (Lv up = +5 points)',
  'class-choice': '🎯 เควสเลือกอาชีพ',
}

export function Modal({ type, onClose }: Props) {
  if (type === 'none') return null
  return (
    <div
      className="absolute inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="panel w-[640px] max-w-[95%] max-h-[85%] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="top-bar rounded-t-xl flex items-center justify-between">
          <span className="font-bold">{titles[type]}</span>
          <button
            className="w-6 h-6 rounded-full bg-kw-red text-white font-bold text-xs flex items-center justify-center hover:brightness-110"
            onClick={onClose}
          >✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 bg-gradient-to-b from-kw-panel-in to-white">
          {type === 'inventory'    && <InventoryModal />}
          {type === 'craft'        && <CraftModal />}
          {type === 'enhance'      && <EnhanceModal />}
          {type === 'class-change' && <ClassChangeModal />}
          {type === 'shop'         && <ShopModal />}
          {type === 'help'         && <HelpModal />}
          {type === 'race-change'  && <RaceChangeModal />}
          {type === 'status'       && <StatusModal />}
          {type === 'class-choice' && <ClassChoiceModal />}
        </div>
      </div>
    </div>
  )
}

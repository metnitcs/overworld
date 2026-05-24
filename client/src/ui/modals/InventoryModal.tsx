import { useState } from 'react'
import { useGame } from '../../game/store'
import { enhancePlusAtkBonus, enhancePlusDefBonus, type Rarity } from '@asura/shared'

type Tab = 'all' | 'equip' | 'consume' | 'mat'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'all',     label: 'ทั่วไป',    icon: '🎒' },
  { id: 'equip',   label: 'สวมใส่',   icon: '⚔' },
  { id: 'consume', label: 'ใช้งาน',   icon: '🧪' },
  { id: 'mat',     label: 'แร่ธาตุ',  icon: '💎' },
]

const TOTAL_SLOTS = 32

const RARITY_BORDER: Record<Rarity, string> = {
  common:    'border-kw-border',
  rare:      'border-blue-400',
  epic:      'border-purple-500',
  legendary: 'border-amber-500',
}
const RARITY_LABEL: Record<Rarity, string> = {
  common:    'พื้นฐาน',
  rare:      'หายาก',
  epic:      'ตำนาน',
  legendary: 'เทพ',
}

// Slice 47: gear is per-instance and stacks with the same itemKey may have
// different Plus levels. Sort within a tab: itemKey group, then plus DESC.
function sortInvForDisplay<T extends { itemKey: string; plus: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.itemKey !== b.itemKey) return a.itemKey.localeCompare(b.itemKey)
    return b.plus - a.plus
  })
}

export function InventoryModal() {
  const game = useGame(s => s.game)
  const items = useGame(s => s.content!.items)
  const equip = useGame(s => s.equip)
  const unequip = useGame(s => s.unequip)
  const useConsume = useGame(s => s.useConsume)
  const [tab, setTab] = useState<Tab>('all')
  // Slice 47: selection is per-instance — track the InventoryItem.id.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Slice 47: bag list filters out the rows currently in equip slots so
  // the player never sees the equipped item twice (Transfer model, logical).
  const bagRows = game.inventory.filter(
    (r) => r.id !== game.equipWeapon && r.id !== game.equipArmor,
  )
  let visibleRows = bagRows
  if (tab === 'equip')   visibleRows = bagRows.filter((r) => ['weapon', 'armor'].includes(items[r.itemKey]?.type ?? ''))
  if (tab === 'consume') visibleRows = bagRows.filter((r) => items[r.itemKey]?.type === 'consume')
  if (tab === 'mat')     visibleRows = bagRows.filter((r) => items[r.itemKey]?.type === 'mat')
  visibleRows = sortInvForDisplay(visibleRows)

  const sel = selectedId ? game.inventory.find((r) => r.id === selectedId) : null
  const selItem = sel ? items[sel.itemKey] : null
  const selPlus = sel?.plus ?? 0
  const equipped = sel ? (sel.id === game.equipWeapon || sel.id === game.equipArmor) : false
  const selRarity: Rarity = selItem?.rarity ?? 'common'

  const weaponRow = game.equipWeapon ? game.inventory.find((r) => r.id === game.equipWeapon) : null
  const armorRow  = game.equipArmor  ? game.inventory.find((r) => r.id === game.equipArmor)  : null
  const wItem = weaponRow ? items[weaponRow.itemKey] : null
  const aItem = armorRow  ? items[armorRow.itemKey]  : null
  const wPlus = weaponRow?.plus ?? 0
  const aPlus = armorRow?.plus  ?? 0

  return (
    <div className="flex flex-col gap-2">
      {/* Equipped banner */}
      <div className="grid grid-cols-2 gap-2 px-1">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white border-2 border-kw-border rounded text-[11px]">
          <span className="text-xl">⚔</span>
          {wItem ? (
            <div className="flex-1 min-w-0">
              <div className="font-bold text-kw-blue-deep truncate">
                {wItem.emoji} {wItem.name}
                {wPlus > 0 && <span className="text-kw-red ml-1">+{wPlus}</span>}
              </div>
              <div className="text-[10px] text-kw-text-dim">
                ATK +{(wItem.atk || 0) + enhancePlusAtkBonus(wPlus)}
              </div>
            </div>
          ) : (
            <span className="flex-1 italic text-kw-text-dim">ไม่ได้สวมอาวุธ</span>
          )}
          {wItem && (
            <button className="btn btn-sm btn-ghost" onClick={() => unequip('weapon')}>ถอด</button>
          )}
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white border-2 border-kw-border rounded text-[11px]">
          <span className="text-xl">🛡</span>
          {aItem ? (
            <div className="flex-1 min-w-0">
              <div className="font-bold text-kw-blue-deep truncate">
                {aItem.emoji} {aItem.name}
                {aPlus > 0 && <span className="text-kw-red ml-1">+{aPlus}</span>}
              </div>
              <div className="text-[10px] text-kw-text-dim">
                DEF +{(aItem.def || 0) + enhancePlusDefBonus(aPlus)}
              </div>
            </div>
          ) : (
            <span className="flex-1 italic text-kw-text-dim">ไม่ได้สวมเกราะ</span>
          )}
          {aItem && (
            <button className="btn btn-sm btn-ghost" onClick={() => unequip('armor')}>ถอด</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b-2 border-kw-orange">
        {TABS.map(t => (
          <div
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon} {t.label}
          </div>
        ))}
      </div>

      {/* Slot grid — Slice 47: one slot per InventoryItem row */}
      <div className="bg-white border-2 border-kw-border rounded p-2">
        <div className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: Math.max(TOTAL_SLOTS, visibleRows.length) }).map((_, i) => {
            const row = visibleRows[i]
            if (!row) return <div key={i} className="inv-slot empty" />
            const it = items[row.itemKey]
            if (!it) return <div key={i} className="inv-slot empty" />
            const rarityBorder = RARITY_BORDER[it.rarity ?? 'common']
            return (
              <div
                key={row.id}
                className={`inv-slot ${rarityBorder} ${selectedId === row.id ? '!border-kw-orange ring-2 ring-kw-orange/40' : ''}`}
                onClick={() => setSelectedId(row.id)}
              >
                {it.emoji}
                {row.qty > 1 && <span className="qty">{row.qty}</span>}
                {row.plus > 0 && <span className="plus">+{row.plus}</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div className="panel panel-pad min-h-[80px]">
        {sel && selItem ? (
          <div className="flex gap-3 items-start">
            <div className="text-4xl">{selItem.emoji}</div>
            <div className="flex-1">
              <div className="font-bold text-kw-blue-deep">
                {selItem.name}
                {selPlus > 0 && <span className="text-kw-red ml-1">+{selPlus}</span>}
                {equipped && <span className="text-green-600 text-xs ml-2">(สวมอยู่)</span>}
                <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${RARITY_BORDER[selRarity]}`}>
                  {RARITY_LABEL[selRarity]}
                </span>
              </div>
              <div className="text-xs text-kw-text-dim mt-0.5">{selItem.desc}</div>
              <div className="text-xs text-kw-blue-deep mt-1 font-semibold">
                {selItem.atk != null && selItem.atk !== 0 && `ATK +${selItem.atk}${selPlus > 0 ? ` (+${enhancePlusAtkBonus(selPlus)} จากบวก)` : ''} `}
                {selItem.def != null && selItem.def !== 0 && `DEF +${selItem.def}${selPlus > 0 ? ` (+${enhancePlusDefBonus(selPlus)} จากบวก)` : ''} `}
                {selItem.heal && `ฟื้น ${selItem.heal} HP `}
                {selItem.healMp && `ฟื้น ${selItem.healMp} MP `}
              </div>
              {/* Slice 51: per-item primary stat bonuses (flat). */}
              {(selItem.bonusStr || selItem.bonusInt || selItem.bonusDex || selItem.bonusAgi || selItem.bonusLuk || selItem.bonusVit) ? (
                <div className="text-[10px] text-kw-orange mt-0.5">
                  ✨ Bonus: {[
                    selItem.bonusStr && `+${selItem.bonusStr} STR`,
                    selItem.bonusInt && `+${selItem.bonusInt} INT`,
                    selItem.bonusDex && `+${selItem.bonusDex} DEX`,
                    selItem.bonusAgi && `+${selItem.bonusAgi} AGI`,
                    selItem.bonusLuk && `+${selItem.bonusLuk} LUK`,
                    selItem.bonusVit && `+${selItem.bonusVit} VIT`,
                  ].filter(Boolean).join(' · ')}
                </div>
              ) : null}
              <div className="text-xs mt-1 text-kw-text-dim">มี {sel.qty} ชิ้น</div>
            </div>
            <div className="flex flex-col gap-1">
              {selItem.type === 'consume' && (
                <button className="btn btn-sm btn-green" onClick={() => useConsume(sel.itemKey)}>
                  ใช้
                </button>
              )}
              {(selItem.type === 'weapon' || selItem.type === 'armor') && !equipped && (
                <button className="btn btn-sm" onClick={() => equip(sel.id)}>สวม</button>
              )}
              {(selItem.type === 'weapon' || selItem.type === 'armor') && equipped && (
                <button className="btn btn-sm btn-ghost"
                  onClick={() => unequip(selItem.type === 'weapon' ? 'weapon' : 'armor')}>
                  ถอด
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center text-kw-text-dim text-xs py-2">
            คลิกที่ไอเท็มเพื่อดูรายละเอียด
          </div>
        )}
      </div>

      <div className="flex justify-between text-xs text-kw-text-dim px-1">
        <span>จำนวนไอเท็ม {visibleRows.length} ชิ้น</span>
        <span>จำนวนเงิน <span className="text-kw-orange font-bold">{game.gold.toLocaleString()}</span> พีซ</span>
      </div>
    </div>
  )
}

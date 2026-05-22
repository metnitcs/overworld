import { useGame } from '../../game/store'
import { HEAL_FULL_COST } from '@asura/shared'

/** Shop + Healer view for the village (and any future map carrying these
 *  NPC kinds). Reads stock from the Content cache (ADR 0002): for each NPC
 *  on the current map, render its items (shop) or a heal-full action
 *  (healer). Heal cost lives in `HEAL_FULL_COST` so seed + UI agree. */
export function ShopModal() {
  const game = useGame(s => s.game)
  const items = useGame(s => s.content!.items)
  const npcs = useGame(s => s.content!.maps[s.game.map].npcs)
  const spendGold = useGame(s => s.spendGold)
  const addItem = useGame(s => s.addItem)
  const log = useGame(s => s.log)

  function buyItem(itemKey: string, price: number, displayName: string) {
    if (!spendGold(price)) return
    addItem(itemKey)
    log(`ซื้อ ${displayName}`, 'good')
  }

  function healFull() {
    if (!spendGold(HEAL_FULL_COST)) return
    const g = { ...useGame.getState().game }
    g.hp = g.maxHp
    g.mp = g.maxMp
    useGame.setState({ game: g })
    log('💊 ฟื้นฟูเต็มหลอด!', 'good')
  }

  const healers = npcs.filter((n) => n.kind === 'healer')
  const shopkeepers = npcs.filter((n) => n.kind === 'shop')

  if (healers.length === 0 && shopkeepers.length === 0) {
    return (
      <div className="text-center text-xs text-kw-text-dim py-4">
        ไม่มีร้านค้าหรือหมอในแมพนี้
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-kw-text-dim px-1">
        บริการของหมอประจำหมู่บ้านและร้านขายของ
      </div>

      {healers.map((healer) => (
        <div key={healer.id} className="panel panel-pad flex items-center gap-3">
          <div className="text-3xl">{healer.emoji ?? '⚕'}</div>
          <div className="flex-1">
            <div className="font-bold text-kw-blue-deep text-sm">{healer.name}</div>
            <div className="text-[10px] text-kw-text-dim">รักษา HP/MP เต็มหลอด</div>
          </div>
          <div className="text-kw-orange font-semibold text-sm mr-1">💰 {HEAL_FULL_COST}</div>
          <button
            className="btn btn-sm btn-green"
            disabled={game.gold < HEAL_FULL_COST}
            onClick={healFull}
          >
            ฟื้นฟู
          </button>
        </div>
      ))}

      {shopkeepers.flatMap((shop) =>
        shop.shop.map((entry) => {
          const item = items[entry.item]
          if (!item) return null
          return (
            <div key={`${shop.id}:${entry.item}`} className="panel panel-pad flex items-center gap-3">
              <div className="text-3xl">{item.emoji}</div>
              <div className="flex-1">
                <div className="font-bold text-kw-blue-deep text-sm">{item.name}</div>
                <div className="text-[10px] text-kw-text-dim">{item.desc}</div>
              </div>
              <div className="text-kw-orange font-semibold text-sm mr-1">💰 {entry.price}</div>
              <button
                className="btn btn-sm btn-green"
                disabled={game.gold < entry.price}
                onClick={() => buyItem(entry.item, entry.price, item.name)}
              >
                ซื้อ
              </button>
            </div>
          )
        }),
      )}

      <div className="text-xs text-right text-kw-text-dim px-1 pt-1">
        ทองที่มี: <b className="text-kw-orange">{game.gold.toLocaleString()}</b> พีซ
      </div>
    </div>
  )
}

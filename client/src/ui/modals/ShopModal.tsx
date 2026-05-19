import { useGame } from '../../game/store'

interface ShopEntry {
  icon: string
  name: string
  desc: string
  cost: number
  action: 'heal' | 'buy'
  itemKey?: string
}

const ENTRIES: ShopEntry[] = [
  { icon: '💊', name: 'ฟื้นฟู HP/MP เต็ม', desc: 'รักษาเต็มหลอด',          cost: 50,  action: 'heal' },
  { icon: '🧪', name: 'ยาฟื้น HP เล็ก',   desc: 'ฟื้น HP 50',              cost: 30,  action: 'buy', itemKey: 'potion-s' },
  { icon: '🍶', name: 'ยาฟื้น HP กลาง',  desc: 'ฟื้น HP 150',             cost: 100, action: 'buy', itemKey: 'potion-m' },
  { icon: '🏺', name: 'ยาฟื้น HP ใหญ่',  desc: 'ฟื้น HP 400',             cost: 300, action: 'buy', itemKey: 'potion-l' },
  { icon: '💧', name: 'น้ำมนตร์',         desc: 'ฟื้น MP 30',              cost: 50,  action: 'buy', itemKey: 'ether-s' },
  { icon: '💠', name: 'หินตีบวก',         desc: 'ใช้สำหรับตีบวกอาวุธ/เกราะ', cost: 250, action: 'buy', itemKey: 'plus-stone' },
]

export function ShopModal() {
  const game = useGame(s => s.game)
  const spendGold = useGame(s => s.spendGold)
  const addItem = useGame(s => s.addItem)
  const log = useGame(s => s.log)

  function buy(e: ShopEntry) {
    if (!spendGold(e.cost)) return
    if (e.action === 'heal') {
      const g = { ...useGame.getState().game }
      g.hp = g.maxHp
      g.mp = g.maxMp
      useGame.setState({ game: g })
      log('💊 ฟื้นฟูเต็มหลอด!', 'good')
    } else if (e.itemKey) {
      addItem(e.itemKey)
      log(`ซื้อ ${e.name}`, 'good')
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-kw-text-dim px-1">
        บริการของหมอประจำหมู่บ้านและร้านขายของ
      </div>
      {ENTRIES.map(e => (
        <div key={e.name} className="panel panel-pad flex items-center gap-3">
          <div className="text-3xl">{e.icon}</div>
          <div className="flex-1">
            <div className="font-bold text-kw-blue-deep text-sm">{e.name}</div>
            <div className="text-[10px] text-kw-text-dim">{e.desc}</div>
          </div>
          <div className="text-kw-orange font-semibold text-sm mr-1">💰 {e.cost}</div>
          <button
            className="btn btn-sm btn-green"
            disabled={game.gold < e.cost}
            onClick={() => buy(e)}
          >
            ซื้อ
          </button>
        </div>
      ))}
      <div className="text-xs text-right text-kw-text-dim px-1 pt-1">
        ทองที่มี: <b className="text-kw-orange">{game.gold.toLocaleString()}</b> พีซ
      </div>
    </div>
  )
}

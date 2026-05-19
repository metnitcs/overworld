import { useGame } from '../../game/store'
import { RECIPES, ITEMS } from '../../game/data'

export function CraftModal() {
  const game = useGame(s => s.game)
  const craft = useGame(s => s.craft)

  return (
    <div className="space-y-2">
      <div className="text-xs text-kw-text-dim px-1">
        ใช้วัตถุดิบและทอง สร้างอาวุธหรือเกราะใหม่ (บางสูตรจำกัดอาชีพ)
      </div>
      {RECIPES.filter(r => !r.classReq || r.classReq.includes(game.classId)).map(rec => {
        const result = ITEMS[rec.result]
        const haveMats = Object.entries(rec.mats).every(([k, n]) => (game.inventory[k] || 0) >= n)
        const haveGold = game.gold >= rec.gold
        const can = haveMats && haveGold
        const stat = result.atk ? `ATK +${result.atk}` : result.def ? `DEF +${result.def}` : result.desc
        return (
          <div key={rec.result} className="panel panel-pad flex items-center gap-3">
            <div className="text-3xl">{result.emoji}</div>
            <div className="flex-1 text-xs">
              <div className="font-bold text-kw-blue-deep">{result.name}</div>
              <div className="text-kw-orange">{stat}</div>
              <div className="flex flex-wrap gap-x-2 text-[10px] mt-0.5">
                {Object.entries(rec.mats).map(([k, n]) => {
                  const have = game.inventory[k] || 0
                  return (
                    <span key={k} className={have >= n ? 'text-green-700' : 'text-red-700'}>
                      {ITEMS[k].emoji} {ITEMS[k].name} {have}/{n}
                    </span>
                  )
                })}
                <span className={haveGold ? 'text-green-700' : 'text-red-700'}>
                  💰 {rec.gold}
                </span>
              </div>
            </div>
            <button
              className="btn btn-sm"
              disabled={!can}
              onClick={() => craft(rec.result)}
            >
              คราฟ
            </button>
          </div>
        )
      })}
    </div>
  )
}

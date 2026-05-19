export function HelpModal() {
  return (
    <div className="text-sm leading-relaxed space-y-3 text-kw-text">
      <Section title="🎮 การควบคุม">
        <p>• ใช้ปุ่มลูกศร ⬆⬇⬅➡ หรือ <b>WASD</b> เพื่อเดินตัวละครบนแมพ</p>
        <p>• <b>เดินชนมอนสเตอร์</b> → ตัดเข้าฉากต่อสู้แบบเทิร์น</p>
        <p>• <b>เดินเข้าช่อง 🌀 วาป</b> → เปลี่ยนแมพไปจุดที่กำหนด</p>
        <p>• ในต่อสู้: <b>โจมตี</b>, ใช้ <b>สกิล</b> (เปลือง MP), ใช้ <b>ไอเทม</b>, หรือ <b>หนี</b></p>
      </Section>

      <Section title="⚙ ระบบเกม">
        <p>• <b>เผ่า</b> กำหนดค่าสถานะพื้นฐาน (HP/MP/ATK/DEF/SPD) เลือกครั้งเดียวตอนสร้างตัว</p>
        <p>• <b>อาชีพ</b> กำหนดสกิลและสไตล์การต่อสู้ เปลี่ยนได้ภายหลังจ่าย 500 ทอง</p>
        <p>• <b>คราฟ</b> รวมวัตถุดิบจากมอนสเตอร์ + ทอง → อาวุธ/เกราะ</p>
        <p>• <b>ตีบวก</b> ใช้ 💠 หินตีบวก เพิ่ม +1 ถึง +10 ให้อาวุธ/เกราะ
           (โอกาสสำเร็จลดลงตามระดับ, ล้มเหลวระดับสูงอาจลดบวก!)</p>
        <p>• <b>แมพ</b> มี 5 แห่ง: หมู่บ้าน → ทุ่งซากุระ → ป่าเร้นลับ → ภูเขาไฟ → นรกลึก</p>
      </Section>

      <Section title="💡 เทคนิค">
        <p>• ตีมอนแล้วได้วัตถุดิบ → คราฟอาวุธใหม่ → ตีบวก → ไปแมพยากกว่าได้</p>
        <p>• อย่าลืม <b>💾 เซฟ</b> เกมบ่อยๆ (ข้อมูลเก็บใน localStorage ของเบราว์เซอร์)</p>
        <p>• ถ้าตาย จะเสียทองครึ่งหนึ่งและกลับมาที่หมู่บ้าน</p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel panel-pad">
      <div className="panel-title">{title}</div>
      <div className="text-xs leading-relaxed">{children}</div>
    </div>
  )
}

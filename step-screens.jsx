// step-screens.jsx
// 10ステップ入力エリア(中央ペイン)。
// 計算は一切行わず、hvac-calc-engine.js の SHARED-LOGIC を呼んだ結果(calc)を表示するだけ。

import {
  GLASS_TYPES,
  ORIENTATIONS,
  SHADING_TYPES,
  VENTILATION_TYPES,
  createWall,
  createWindow,
  roomVolume,
  roomsOfFloor,
} from "./project-model.mjs";
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  Note,
  NumberInput,
  Panel,
  SelectInput,
  Stat,
  T,
  Table,
  Tag,
  Td,
  TextInput,
} from "./ui-kit.jsx";

const num = (v, digits = 1) => (Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : "―");

function RoomCard({ room, floorName, children }) {
  return (
    <div style={{ border: `1px solid ${T.line}` }}>
      <div className="px-4 py-2 flex items-center gap-2" style={{ background: T.bg, borderBottom: `1px solid ${T.line}` }}>
        <span className="text-[12px] font-semibold" style={{ color: T.navy }}>{room.name || "(室名未設定)"}</span>
        <Tag tone="muted">{floorName}</Tag>
        <span className="text-[11px]" style={{ color: T.gray }}>{num(room.floorArea)} m²</span>
      </div>
      <div className="px-4 py-1">{children}</div>
    </div>
  );
}

function RoomList({ project, render }) {
  if (!project.rooms.length) {
    return <EmptyState message="室が登録されていません。ステップ3「室」で室を追加してください。" />;
  }
  return (
    <div className="flex flex-col gap-4">
      {project.rooms.map((room) => {
        const floor = project.floors.find((f) => f.floorId === room.floorId);
        return (
          <RoomCard key={room.roomId} room={room} floorName={floor ? floor.name : "―"}>
            {render(room)}
          </RoomCard>
        );
      })}
    </div>
  );
}

function BuildingStep({ project, actions, engine }) {
  return (
    <Panel title="1. 建物 / 案件基本情報" subtitle="案件情報と建物全体の条件を入力します。" tone="accent">
      <Field label="案件名" required>
        <TextInput value={project.projectName} onChange={(v) => actions.setField("projectName", v)} width="w-64" />
      </Field>
      <Field label="施主・顧客名">
        <TextInput value={project.client} onChange={(v) => actions.setField("client", v)} width="w-64" />
      </Field>
      <Field label="現場所在地">
        <TextInput value={project.siteAddress} onChange={(v) => actions.setField("siteAddress", v)} width="w-64" />
      </Field>
      <Field label="建物用途(既定)" hint="室ごとに用途を個別指定できます。ここでは室で未指定の場合に使う既定値を選びます。">
        <SelectInput value={project.buildingTypeId} onChange={(v) => actions.setField("buildingTypeId", v)} options={engine.BUILDING_TYPES} />
      </Field>
      <Field label="地域区分" hint="地域係数(冷房・暖房)に使用します。">
        <SelectInput value={project.regionId} onChange={(v) => actions.setField("regionId", v)} options={engine.REGIONS} />
      </Field>
      <Field label="延床面積" unit="m²" required hint="室面積の合計との整合はステップ9で確認します。">
        <NumberInput value={project.totalFloorArea} onChange={(v) => actions.setField("totalFloorArea", v)} step={10} />
      </Field>
      <Field label="空調対象面積" unit="m²" hint="参考記録用。負荷計算には室ごとの面積を使用します。">
        <NumberInput value={project.airConditionedArea} onChange={(v) => actions.setField("airConditionedArea", v)} step={10} />
      </Field>
      <Field label="運転時間" hint="参考記録用。現行の計算方式では負荷に影響しません。">
        <div className="flex items-center gap-2">
          <TextInput value={project.operatingHours.start} onChange={(v) => actions.setField("operatingHours", { ...project.operatingHours, start: v })} width="w-20" placeholder="09:00" />
          <span className="text-[12px]" style={{ color: T.gray }}>〜</span>
          <TextInput value={project.operatingHours.end} onChange={(v) => actions.setField("operatingHours", { ...project.operatingHours, end: v })} width="w-20" placeholder="18:00" />
        </div>
      </Field>
      <Field label="計画上の余裕" unit="%" hint="既定0%。一律の安全率は自動適用しません。">
        <NumberInput value={project.marginPct} onChange={(v) => actions.setField("marginPct", v ?? 0)} min={0} width="w-20" />
      </Field>
      <Field label="備考">
        <TextInput value={project.note} onChange={(v) => actions.setField("note", v)} width="w-64" />
      </Field>
    </Panel>
  );
}

function FloorsStep({ project, actions }) {
  return (
    <Panel
      title="2. 階構成"
      subtitle="階を登録します。階数は機器の階別配分表示に使用し、負荷計算そのものには影響しません。"
      tone="accent"
      actions={<Button variant="accent" size="sm" onClick={actions.addFloor}>階を追加</Button>}
    >
      <Table head={[{ label: "階名" }, { label: "階レベル", align: "right" }, { label: "備考" }, { label: "室数", align: "right" }, { label: "", align: "right" }]}>
        {project.floors.map((floor) => (
          <tr key={floor.floorId}>
            <Td><TextInput value={floor.name} onChange={(v) => actions.updateFloor(floor.floorId, { name: v })} width="w-28" /></Td>
            <Td align="right"><NumberInput value={floor.level} onChange={(v) => actions.updateFloor(floor.floorId, { level: v })} width="w-20" /></Td>
            <Td><TextInput value={floor.note} onChange={(v) => actions.updateFloor(floor.floorId, { note: v })} width="w-56" /></Td>
            <Td align="right" mono>{roomsOfFloor(project, floor.floorId).length}</Td>
            <Td align="right">
              <Button size="sm" variant="danger" disabled={project.floors.length <= 1} onClick={() => actions.removeFloor(floor.floorId)}>削除</Button>
            </Td>
          </tr>
        ))}
      </Table>
      <div className="mt-4">
        <Note>階を削除すると、その階に属する室も一緒に削除されます。</Note>
      </div>
    </Panel>
  );
}

function RoomsStep({ project, actions, engine }) {
  const usageOptions = [{ id: "", label: "建物用途に従う" }, ...engine.BUILDING_TYPES];
  return (
    <div className="flex flex-col gap-4">
      {project.floors.map((floor) => (
        <Panel
          key={floor.floorId}
          title={`3. 室 / ${floor.name}`}
          subtitle="室名・室用途・床面積・天井高を入力します。床面積は負荷計算に直接使用します。"
          tone="accent"
          actions={<Button variant="accent" size="sm" onClick={() => actions.addRoom(floor.floorId)}>室を追加</Button>}
        >
          {roomsOfFloor(project, floor.floorId).length === 0 ? (
            <EmptyState message="この階には室が登録されていません。" action={<Button variant="accent" size="sm" onClick={() => actions.addRoom(floor.floorId)}>室を追加</Button>} />
          ) : (
            <Table
              head={[
                { label: "室名" },
                { label: "室用途" },
                { label: "空調系統" },
                { label: "床面積 (m²)", align: "right" },
                { label: "天井高 (m)", align: "right" },
                { label: "容積 (m³)", align: "right" },
                { label: "", align: "right" },
              ]}
            >
              {roomsOfFloor(project, floor.floorId).map((room) => (
                <tr key={room.roomId}>
                  <Td><TextInput value={room.name} onChange={(v) => actions.updateRoom(room.roomId, { name: v })} width="w-36" /></Td>
                  <Td><SelectInput value={room.usage ?? ""} onChange={(v) => actions.updateRoom(room.roomId, { usage: v || null })} options={usageOptions} width="w-40" /></Td>
                  <Td>
                    <TextInput
                      value={room.systemId ?? ""}
                      onChange={(v) => actions.updateRoom(room.roomId, { systemId: v || null })}
                      width="w-28"
                      placeholder="系統名"
                    />
                  </Td>
                  <Td align="right"><NumberInput value={room.floorArea} onChange={(v) => actions.updateRoom(room.roomId, { floorArea: v })} step={5} width="w-24" /></Td>
                  <Td align="right"><NumberInput value={room.ceilingHeight} onChange={(v) => actions.updateRoom(room.roomId, { ceilingHeight: v })} step={0.1} width="w-20" /></Td>
                  <Td align="right" mono>{num(roomVolume(room))}</Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" onClick={() => actions.duplicateRoom(room.roomId)}>複製</Button>
                      <Button size="sm" variant="danger" onClick={() => actions.removeRoom(room.roomId)}>削除</Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      ))}
    </div>
  );
}

function ConditionsStep({ project, actions }) {
  return (
    <Panel title="4. 室内条件" subtitle="室内設定温度・湿度・運転時間を室ごとに入力します。" tone="accent">
      <div className="mb-4">
        <Note tone="warn">
          室内設定温度は温度補正係数として計算に反映されます。湿度・運転時間は現行の計算方式(面積原単位方式)では負荷に反映されません(記録用)。
        </Note>
      </div>
      <RoomList
        project={project}
        render={(room) => (
          <>
            <Field label="冷房設定温度" unit="℃" hint="未入力の場合は26℃として計算します。">
              <NumberInput value={room.indoorTemperature.cooling} onChange={(v) => actions.updateRoom(room.roomId, { indoorTemperature: { ...room.indoorTemperature, cooling: v } })} step={0.5} width="w-20" />
            </Field>
            <Field label="暖房設定温度" unit="℃" hint="未入力の場合は22℃として計算します。">
              <NumberInput value={room.indoorTemperature.heating} onChange={(v) => actions.updateRoom(room.roomId, { indoorTemperature: { ...room.indoorTemperature, heating: v } })} step={0.5} width="w-20" />
            </Field>
            <Field label="冷房時 室内湿度" unit="%RH">
              <NumberInput value={room.indoorHumidity.cooling} onChange={(v) => actions.updateRoom(room.roomId, { indoorHumidity: { ...room.indoorHumidity, cooling: v } })} width="w-20" />
            </Field>
            <Field label="暖房時 室内湿度" unit="%RH">
              <NumberInput value={room.indoorHumidity.heating} onChange={(v) => actions.updateRoom(room.roomId, { indoorHumidity: { ...room.indoorHumidity, heating: v } })} width="w-20" />
            </Field>
            <Field label="運転時間">
              <div className="flex items-center gap-2">
                <TextInput value={room.operatingHours.start} onChange={(v) => actions.updateRoom(room.roomId, { operatingHours: { ...room.operatingHours, start: v } })} width="w-20" placeholder="09:00" />
                <span className="text-[12px]" style={{ color: T.gray }}>〜</span>
                <TextInput value={room.operatingHours.end} onChange={(v) => actions.updateRoom(room.roomId, { operatingHours: { ...room.operatingHours, end: v } })} width="w-20" placeholder="18:00" />
              </div>
            </Field>
          </>
        )}
      />
    </Panel>
  );
}

function OccupancyStep({ project, actions, calc, engine }) {
  const resultOf = (roomId) => calc?.rooms.find((r) => r.room.roomId === roomId);
  return (
    <Panel title="5. 人員" subtitle="室ごとの在室人数を入力します。換気量(人数 × 用途別原単位)の算出に使用します。" tone="accent">
      <div className="mb-4">
        <Note>
          人体発熱は参考値として算出しますが、面積原単位に人体発熱が含まれるか未確認のため、既定では設計用必要負荷に加算していません。
        </Note>
      </div>
      <RoomList
        project={project}
        render={(room) => {
          const entry = resultOf(room.roomId);
          const usage = engine.BUILDING_TYPES.find((b) => b.id === (room.usage || project.buildingTypeId));
          return (
            <>
              <Field label="在室人数" unit="人" hint={usage ? `${usage.label}の換気原単位: ${usage.ventPerPerson} m³/h・人` : undefined}>
                <NumberInput value={room.occupancy} onChange={(v) => actions.updateRoom(room.roomId, { occupancy: v })} width="w-20" />
              </Field>
              <div className="grid grid-cols-3 gap-4 py-3">
                <Stat label="必要換気量" value={entry?.loadResult.status === "ok" ? Math.round(entry.loadResult.ventilationM3h).toLocaleString() : "―"} unit="m³/h" tone="blue" />
                <Stat label="人体顕熱(参考)" value={entry?.loadResult.status === "ok" ? num(entry.loadResult.occupantSensibleKW, 2) : "―"} unit="kW" sub="設計用負荷に未算入" />
                <Stat label="人体潜熱(参考)" value={entry?.loadResult.status === "ok" ? num(entry.loadResult.occupantLatentKW, 2) : "―"} unit="kW" sub="設計用負荷に未算入" />
              </div>
            </>
          );
        }}
      />
    </Panel>
  );
}

function InternalHeatStep({ project, actions }) {
  return (
    <Panel title="6. 照明 / 機器発熱" subtitle="内部発熱の参考入力です。" tone="accent">
      <div className="mb-4">
        <Note tone="warn">
          現行の計算方式(面積原単位方式)は照明・機器発熱を個別に積み上げません。ここでの入力は記録・将来の詳細計算用で、負荷計算結果には反映されません。
        </Note>
      </div>
      <RoomList
        project={project}
        render={(room) => (
          <>
            <Field label="照明発熱" unit="W/m²">
              <NumberInput value={room.internalHeat.lightingWm2} onChange={(v) => actions.updateRoom(room.roomId, { internalHeat: { ...room.internalHeat, lightingWm2: v } })} width="w-20" />
            </Field>
            <Field label="機器発熱" unit="W/m²">
              <NumberInput value={room.internalHeat.equipmentWm2} onChange={(v) => actions.updateRoom(room.roomId, { internalHeat: { ...room.internalHeat, equipmentWm2: v } })} width="w-20" />
            </Field>
          </>
        )}
      />
    </Panel>
  );
}

function OutdoorAirStep({ project, actions, calc }) {
  const resultOf = (roomId) => calc?.rooms.find((r) => r.room.roomId === roomId);
  return (
    <Panel title="7. 外気 / 換気" subtitle="外気量・換気方式・全熱交換の条件を入力します。" tone="accent">
      <div className="mb-4">
        <Note tone="warn">
          換気量は「在室人数 × 用途別原単位」で自動算出します。外気負荷(熱量)は現行の計算方式では設計用必要負荷に加算していません。
        </Note>
      </div>
      <RoomList
        project={project}
        render={(room) => {
          const entry = resultOf(room.roomId);
          return (
            <>
              <Field label="自動算出換気量" unit="m³/h" hint="在室人数 × 用途別原単位(計算エンジンによる算出値)">
                <span className="text-[13px] font-mono tabular-nums w-28 text-right inline-block" style={{ color: T.ink }}>
                  {entry?.loadResult.status === "ok" ? Math.round(entry.loadResult.ventilationM3h).toLocaleString() : "―"}
                </span>
              </Field>
              <Field label="設計外気量(手入力)" unit="m³/h" hint="設計値を記録する場合に入力します(計算には未使用)。">
                <NumberInput value={room.outdoorAir.volumeM3h} onChange={(v) => actions.updateRoom(room.roomId, { outdoorAir: { ...room.outdoorAir, volumeM3h: v } })} step={10} />
              </Field>
              <Field label="換気方式">
                <SelectInput value={room.outdoorAir.ventilationType ?? ""} onChange={(v) => actions.updateRoom(room.roomId, { outdoorAir: { ...room.outdoorAir, ventilationType: v || null } })} options={VENTILATION_TYPES} width="w-40" />
              </Field>
              <Field label="全熱交換器">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={room.outdoorAir.heatRecovery.enabled}
                    onChange={(v) => actions.updateRoom(room.roomId, { outdoorAir: { ...room.outdoorAir, heatRecovery: { ...room.outdoorAir.heatRecovery, enabled: v } } })}
                    label="採用する"
                  />
                  <NumberInput
                    value={room.outdoorAir.heatRecovery.efficiency}
                    onChange={(v) => actions.updateRoom(room.roomId, { outdoorAir: { ...room.outdoorAir, heatRecovery: { ...room.outdoorAir.heatRecovery, efficiency: v } } })}
                    width="w-20"
                    placeholder="効率"
                  />
                  <span className="text-[11px]" style={{ color: T.gray }}>%</span>
                </div>
              </Field>
              <Field label="外部に面する扉">
                <Checkbox
                  checked={room.outdoorAir.infiltration.hasExternalDoor}
                  onChange={(v) => actions.updateRoom(room.roomId, { outdoorAir: { ...room.outdoorAir, infiltration: { ...room.outdoorAir.infiltration, hasExternalDoor: v } } })}
                  label="あり"
                />
              </Field>
            </>
          );
        }}
      />
    </Panel>
  );
}

function EnvelopeStep({ project, actions }) {
  return (
    <Panel title="8. 外皮 / 窓" subtitle="外壁・屋根・床・開口部の参考入力です。" tone="accent">
      <div className="mb-4">
        <Note tone="warn">
          外皮・窓・方位・日射の詳細計算(詳細方式)は未実装です。入力値は記録用で、負荷計算結果には反映されません。
        </Note>
      </div>
      <RoomList
        project={project}
        render={(room) => (
          <>
            <div className="py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold" style={{ color: T.navy }}>外壁</span>
                <Button size="sm" onClick={() => actions.updateRoom(room.roomId, { envelope: { ...room.envelope, walls: [...room.envelope.walls, createWall()] } })}>外壁を追加</Button>
              </div>
              {room.envelope.walls.length === 0 ? (
                <p className="text-[11px]" style={{ color: T.grayLight }}>外壁が登録されていません。</p>
              ) : (
                <Table head={[{ label: "方位" }, { label: "面積 (m²)", align: "right" }, { label: "U値 (W/m²・K)", align: "right" }, { label: "", align: "right" }]}>
                  {room.envelope.walls.map((wall, i) => (
                    <tr key={`wall-${i}`}>
                      <Td>
                        <SelectInput
                          value={wall.orientation}
                          onChange={(v) => actions.updateWall(room.roomId, i, { orientation: v })}
                          options={ORIENTATIONS}
                          width="w-24"
                        />
                      </Td>
                      <Td align="right"><NumberInput value={wall.area} onChange={(v) => actions.updateWall(room.roomId, i, { area: v })} width="w-24" /></Td>
                      <Td align="right"><NumberInput value={wall.uValue} onChange={(v) => actions.updateWall(room.roomId, i, { uValue: v })} step={0.1} width="w-24" /></Td>
                      <Td align="right"><Button size="sm" variant="danger" onClick={() => actions.removeWall(room.roomId, i)}>削除</Button></Td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
            <div className="py-3" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold" style={{ color: T.navy }}>窓・開口部</span>
                <Button size="sm" onClick={() => actions.updateRoom(room.roomId, { windows: [...room.windows, createWindow()] })}>窓を追加</Button>
              </div>
              {room.windows.length === 0 ? (
                <p className="text-[11px]" style={{ color: T.grayLight }}>窓が登録されていません。</p>
              ) : (
                <Table head={[{ label: "方位" }, { label: "面積 (m²)", align: "right" }, { label: "ガラス種別" }, { label: "日射遮蔽" }, { label: "", align: "right" }]}>
                  {room.windows.map((win, i) => (
                    <tr key={`win-${i}`}>
                      <Td><SelectInput value={win.orientation} onChange={(v) => actions.updateWindow(room.roomId, i, { orientation: v })} options={ORIENTATIONS} width="w-24" /></Td>
                      <Td align="right"><NumberInput value={win.area} onChange={(v) => actions.updateWindow(room.roomId, i, { area: v })} step={0.5} width="w-24" /></Td>
                      <Td><SelectInput value={win.glassType} onChange={(v) => actions.updateWindow(room.roomId, i, { glassType: v })} options={GLASS_TYPES} width="w-40" /></Td>
                      <Td><SelectInput value={win.shading} onChange={(v) => actions.updateWindow(room.roomId, i, { shading: v })} options={SHADING_TYPES} width="w-32" /></Td>
                      <Td align="right"><Button size="sm" variant="danger" onClick={() => actions.removeWindow(room.roomId, i)}>削除</Button></Td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
            <div className="py-3" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
              <Field label="屋根 面積 / U値">
                <div className="flex items-center gap-2">
                  <NumberInput value={room.envelope.roof.area} onChange={(v) => actions.updateRoom(room.roomId, { envelope: { ...room.envelope, roof: { ...room.envelope.roof, area: v } } })} width="w-24" />
                  <NumberInput value={room.envelope.roof.uValue} onChange={(v) => actions.updateRoom(room.roomId, { envelope: { ...room.envelope, roof: { ...room.envelope.roof, uValue: v } } })} step={0.1} width="w-24" />
                </div>
              </Field>
              <Field label="床 面積 / U値">
                <div className="flex items-center gap-2">
                  <NumberInput value={room.envelope.floor.area} onChange={(v) => actions.updateRoom(room.roomId, { envelope: { ...room.envelope, floor: { ...room.envelope.floor, area: v } } })} width="w-24" />
                  <NumberInput value={room.envelope.floor.uValue} onChange={(v) => actions.updateRoom(room.roomId, { envelope: { ...room.envelope, floor: { ...room.envelope.floor, uValue: v } } })} step={0.1} width="w-24" />
                </div>
              </Field>
            </div>
          </>
        )}
      />
    </Panel>
  );
}

function CalcStep({ project, calc, stepStatus, engine, onGoResult, onJump }) {
  const buildingType = engine.BUILDING_TYPES.find((b) => b.id === project.buildingTypeId);
  const region = engine.REGIONS.find((r) => r.id === project.regionId);
  const blockers = [...stepStatus.building.issues, ...stepStatus.rooms.issues];
  return (
    <div className="flex flex-col gap-4">
      <Panel title="9. 計算条件の確認" subtitle="計算方式と入力の整合を確認してから結果に進みます。" tone="accent">
        <Table head={[{ label: "項目", width: "40%" }, { label: "内容" }]}>
          <tr><Td>計算方式</Td><Td>面積原単位方式(室面積 × 用途別W/m² × 地域係数 × 温度補正 × (1+計画上の余裕))</Td></tr>
          <tr><Td>地域区分</Td><Td>{region ? `${region.label}(冷房 ×${region.coolingFactor} / 暖房 ×${region.heatingFactor})` : "―"}</Td></tr>
          <tr><Td>建物用途(既定)</Td><Td>{buildingType ? `${buildingType.label}(冷房 ${buildingType.coolingWm2.value} W/m² / 暖房 ${buildingType.heatingWm2.value} W/m²)` : "―"}</Td></tr>
          <tr><Td>対象室数</Td><Td>{project.rooms.length} 室(室面積合計 {num(calc?.totals.floorArea)} m²)</Td></tr>
          <tr><Td>計画上の余裕</Td><Td>{project.marginPct} %</Td></tr>
          <tr><Td>人体発熱の扱い</Td><Td>参考算出のみ(設計用必要負荷に未算入)</Td></tr>
        </Table>
      </Panel>

      <Panel title="未実装・計算に反映されない項目" subtitle="現行の計算エンジンの適用範囲を明示します。">
        <ul className="text-[12px] leading-relaxed" style={{ color: T.gray }}>
          <li>・外皮(外壁・屋根・床)の貫流熱負荷</li>
          <li>・窓の貫流熱・日射熱取得</li>
          <li>・照明・機器の内部発熱の個別積み上げ</li>
          <li>・外気負荷の熱量換算(換気量[m³/h]の算出のみ)</li>
          <li>・すきま風、湿度、時刻別(ピーク時刻)計算</li>
        </ul>
        <div className="mt-3">
          <Note tone="warn">用途別W/m²原単位・地域係数・温度補正はいずれも本アプリの暫定値です。実施設計・発注・法規判定の代替にはなりません。</Note>
        </div>
      </Panel>

      <Panel title="入力チェック">
        {blockers.length === 0 ? (
          <p className="text-[12px]" style={{ color: T.ok }}>必須入力は充足しています。計算を実行できます。</p>
        ) : (
          <ul className="text-[12px] leading-relaxed" style={{ color: T.danger }}>
            {blockers.map((issue) => <li key={issue}>⚠ {issue}</li>)}
          </ul>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={onGoResult} disabled={blockers.length > 0}>計算結果を表示</Button>
          <Button onClick={() => onJump("rooms")}>室の入力に戻る</Button>
        </div>
      </Panel>
    </div>
  );
}

function ResultStep({ project, calc, engine, onOpenReport }) {
  const usageLabel = (room) => {
    const type = engine.BUILDING_TYPES.find((b) => b.id === (room.usage || project.buildingTypeId));
    return type ? `${type.label}${room.usage ? "" : "(建物用途)"}` : "―";
  };
  if (!calc || calc.totals.validRoomCount === 0) {
    return (
      <Panel title="10. 結果" tone="accent">
        <EmptyState message="計算可能な室がありません。室の面積を入力してください。" />
      </Panel>
    );
  }
  const totals = calc.totals;
  const selection = calc.buildingSelection;
  return (
    <div className="flex flex-col gap-4">
      <Panel title="10. 結果 / 建物全体" subtitle="室別の計算結果を合算した建物全体の負荷です。" tone="accent" actions={<Button variant="primary" size="sm" onClick={onOpenReport}>レポートを開く</Button>}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <Stat label="設計用必要冷房能力" value={num(totals.designLoadCoolingKW)} unit="kW" tone="cooling" />
          <Stat label="設計用必要暖房能力" value={num(totals.designLoadHeatingKW)} unit="kW" tone="heating" />
          <Stat label="選定基準能力" value={num(totals.requiredCapacityKW)} unit="kW" sub={totals.basis === "cooling" ? "冷房が支配的" : "暖房が支配的"} />
          <Stat label="必要換気量 合計" value={Math.round(totals.ventilationM3h).toLocaleString()} unit="m³/h" tone="blue" />
        </div>
      </Panel>

      <Panel title="室別 計算結果">
        <Table
          head={[
            { label: "室名" },
            { label: "用途" },
            { label: "面積 (m²)", align: "right" },
            { label: "冷房 (kW)", align: "right" },
            { label: "暖房 (kW)", align: "right" },
            { label: "必要能力 (kW)", align: "right" },
            { label: "換気量 (m³/h)", align: "right" },
          ]}
        >
          {calc.rooms.map(({ room, loadResult }) => (
            <tr key={room.roomId}>
              <Td>{room.name || "(室名未設定)"}</Td>
              <Td>{usageLabel(room)}</Td>
              <Td align="right" mono>{num(room.floorArea)}</Td>
              <Td align="right" mono>{loadResult.status === "ok" ? num(loadResult.designLoadCoolingKW) : "―"}</Td>
              <Td align="right" mono>{loadResult.status === "ok" ? num(loadResult.designLoadHeatingKW) : "―"}</Td>
              <Td align="right" mono>{loadResult.status === "ok" ? num(loadResult.requiredCapacityKW) : "―"}</Td>
              <Td align="right" mono>{loadResult.status === "ok" ? Math.round(loadResult.ventilationM3h).toLocaleString() : "―"}</Td>
            </tr>
          ))}
          <tr>
            <Td colSpan={2}><span className="font-semibold">合計</span></Td>
            <Td align="right" mono>{num(totals.floorArea)}</Td>
            <Td align="right" mono>{num(totals.designLoadCoolingKW)}</Td>
            <Td align="right" mono>{num(totals.designLoadHeatingKW)}</Td>
            <Td align="right" mono>{num(totals.requiredCapacityKW)}</Td>
            <Td align="right" mono>{Math.round(totals.ventilationM3h).toLocaleString()}</Td>
          </tr>
        </Table>
      </Panel>

      <Panel title="機器選定(建物全体)" subtitle="必要能力に対する容量クラス候補です。台/階は階数で均等配分した場合の1階あたり台数の目安です。">
        {selection.status === "ok" ? (
          <>
            <div className="mb-3 text-[12px] leading-relaxed" style={{ color: T.gray }}>{selection.selectionReasonText}</div>
            <Table
              minWidth={620}
              head={[
                { label: "容量クラス" },
                { label: "台数", align: "right" },
                { label: "台/階", align: "right" },
                { label: "設置合計 (kW)", align: "right" },
                { label: "余裕率 (%)", align: "right" },
                { label: "区分" },
              ]}
            >
              {selection.candidates.map((c) => (
                <tr key={c.size} style={c.size === selection.recommended.size ? { background: T.blueSoft } : undefined}>
                  <Td>{c.size.toFixed(1)} kW（{c.code} / {c.hp}馬力）{c.size === selection.recommended.size && <span className="ml-2"><Tag tone="navy">推奨</Tag></span>}</Td>
                  <Td align="right" mono>{c.count}</Td>
                  <Td align="right" mono>{c.perFloor.toFixed(1)}</Td>
                  <Td align="right" mono>{c.installedKW.toFixed(1)}</Td>
                  <Td align="right" mono>+{c.surplusPct.toFixed(1)}</Td>
                  <Td>{c.selectionType === "formal" ? <Tag tone="ok">実在機器あり</Tag> : <Tag tone="muted">容量クラス仮選定</Tag>}</Td>
                </tr>
              ))}
            </Table>
            {selection.recommended.realModels.length > 0 && (
              <div className="mt-4">
                <div className="text-[12px] font-semibold mb-2" style={{ color: T.navy }}>推奨クラスの実在機器候補</div>
                <Table head={[{ label: "メーカー" }, { label: "型式" }, { label: "室内機形状" }, { label: "電源" }]}>
                  {selection.recommended.realModels.map((m) => (
                    <tr key={m.model}>
                      <Td>{m.maker}</Td>
                      <Td mono>{m.model}</Td>
                      <Td>{m.indoorType}</Td>
                      <Td>{m.power}</Td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </>
        ) : (
          <p className="text-[12px]" style={{ color: T.danger }}>{selection.reason}</p>
        )}
      </Panel>
    </div>
  );
}

export default function StepEditor(props) {
  switch (props.step) {
    case "building": return <BuildingStep {...props} />;
    case "floors": return <FloorsStep {...props} />;
    case "rooms": return <RoomsStep {...props} />;
    case "conditions": return <ConditionsStep {...props} />;
    case "occupancy": return <OccupancyStep {...props} />;
    case "internal": return <InternalHeatStep {...props} />;
    case "outdoorair": return <OutdoorAirStep {...props} />;
    case "envelope": return <EnvelopeStep {...props} />;
    case "calc": return <CalcStep {...props} />;
    case "result": return <ResultStep {...props} />;
    default: return null;
  }
}

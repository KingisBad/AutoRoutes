import Settings from "../config"
import Promise from "../../PromiseV2"
import Async from "../../Async"
import addListener from "../events/SecretListener"
import RenderLibV2 from "../../RenderLibV2"
import { renderBox, renderScandinavianFlag, chat } from "../utils/utils"
import { convertFromRelative, getRoomName, convertToRealYaw } from "../utils/RoomUtils"
import { getEyeHeightSneaking, getEtherYawPitchFromArgs, rayTraceEtherBlock, playerCoords, swapFromName, rotate, setSneaking, setWalking, movementKeys, releaseMovementKeys, centerCoords, swapFromItemID, leftClick, registerPearlClip, movementKeys } from "../utils/RouteUtils"
import { clickAt, prepareRotate, stopRotating } from "../utils/ServerRotations"
import { data } from "../utils/routesData"
import { getDistance2D, drawLine3d } from "../../BloomCore/utils/utils"
import { Keybind } from "../../KeybindFix"
import "./managementOfShittyAutoRoutesBombDenmarkPleaseEndMe"

let activeNodes = []
let activeNodesCoords = []
let moveKeyListener = false
let moveKeyCooldown = Date.now()
let autoRoutesEnabled = false

new Keybind("Toggle AutoRoutes", Keyboard.KEY_NONE, "AutoRoutes").registerKeyPress(() => {
    autoRoutesEnabled = !autoRoutesEnabled
    chat(`AutoRoutes ${autoRoutesEnabled ? "enabled" : "disabled"}.`)
})

register("renderWorld", () => { // Bro this turned into a mess im too lazy to fix it now
    const settings = Settings()
    if (!settings.autoRoutesEnabled) return
    if (!activeNodes.length) return
    for (let i = 0; i < activeNodes.length; i++) {
        let extraRingData = activeNodesCoords[i]
        let ring = activeNodes[i]
        let position = extraRingData.position
        let color
        if (ring.type === "etherwarp" && extraRingData.etherBlockCoord) {
            let etherCoords = centerCoords([extraRingData.etherBlockCoord[0], extraRingData.etherBlockCoord[1] + 1, extraRingData.etherBlockCoord[2]])
            drawLine3d(extraRingData.position[0], extraRingData.position[1] + 0.01, extraRingData.position[2], etherCoords[0], etherCoords[1] + 0.01, etherCoords[2], 0, 1, 1, 1, 10, false)
        }
        if (settings.displayIndex) Tessellator.drawString(`index: ${i}, type: ${ring.type}`, ...extraRingData.position, 16777215, true, 0.02, false)


        if (extraRingData.triggered || Date.now() - extraRingData.lastUse < 1000) color = [[1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]]
        if (settings.nodeColorPreset === 0 || settings.nodeColorPreset === 1 || extraRingData.triggered && (settings.nodeColorPreset === 2 || settings.nodeColorPreset === 3)) { // dumb shit
            if (!color) {
                if (settings.nodeColorPreset === 0) color = [[0, 1, 1], [1, 0.6862745098039216, 0.6862745098039216], [1, 1, 1], [1, 0.6862745098039216, 0.6862745098039216], [0, 1, 1]]
                else if (settings.nodeColorPreset === 1) color = [[settings.nodeColor1[0] / 255, settings.nodeColor1[1] / 255, settings.nodeColor1[2] / 255], [settings.nodeColor2[0] / 255, settings.nodeColor2[1] / 255, settings.nodeColor2[2] / 255], [settings.nodeColor3[0] / 255, settings.nodeColor3[1] / 255, settings.nodeColor3[2] / 255], [settings.nodeColor4[0] / 255, settings.nodeColor4[1] / 255, settings.nodeColor4[2] / 255], [settings.nodeColor5[0] / 255, settings.nodeColor5[1] / 255, settings.nodeColor5[2] / 255]]
            }
            renderBox(position, ring.radius, 0.75, color)
        }
        else if (settings.nodeColorPreset === 2 || settings.nodeColorPreset === 3) {
            if (settings.nodeColorPreset === 2) color = [[0, 0, 1], [1, 1, 0]] // sweden
            else if (settings.nodeColorPreset === 3) color = [[1, 0, 0], [1, 1, 1]] // denmark
            renderScandinavianFlag(position, ring.radius, 0.75, color[0], color[1])
        }
        else if (settings.nodeColorPreset === 4) { // ring
            if (extraRingData.triggered) color = [1, 0, 0]
            else color = [settings.nodeColor1[0] / 255, settings.nodeColor1[1] / 255, settings.nodeColor1[2] / 255]
            RenderLibV2.drawCyl(...position, ring.radius, ring.radius, -0.01, 40, 1, 90, 0, 0, ...color, 1, false, true)
        }
    }
})

register("tick", () => {
    if (!autoRoutesEnabled) return
    if (!Settings().autoRoutesEnabled) return
    if (Settings().editMode) return
    if (!activeNodes.length) return

    performActions()
})

const performActions = () => {
    let playerPosition = playerCoords().player

    // for (let i = 0; i < activeNodes.length; i++) {
    activeNodes.forEach((ring, i) => {
        // let ring = activeNodes[i]
        let extraRingData = activeNodesCoords[i]
        let ringPos = extraRingData.position
        let distance = getDistance2D(playerPosition[0], playerPosition[2], ringPos[0], ringPos[2])
        if (distance < ring.radius && Math.abs(playerPosition[1] - ringPos[1]) <= ring.height) {
            if (Date.now() - extraRingData.lastUse < 1000) return
            if (extraRingData.triggered) return
            // if (Date.now() - extraRingData.lastUse < 1000) continue
            // if (extraRingData.triggered) continue
            extraRingData.triggered = true
            let exec = () => {
                if (ring.stop) releaseMovementKeys()
                let execRing = () => ringActions[ring.type](ring)
                if (ring.delay) {
                    preRotate(ring)
                    Async.schedule(() => { // Delay if there is a delay set
                        playerPosition = playerCoords().player
                        let distance = getDistance2D(playerPosition[0], playerPosition[2], ringPos[0], ringPos[2])
                        if (distance < ring.radius && Math.abs(playerPosition[1] - ringPos[1]) <= ring.height) Client.scheduleTask(0, execRing)
                        else stopRotating()
                    }, ring.delay)
                } else execRing()
            }

            if (ring.awaitSecret || ring.type === "useItem" && ring.awaitBatSpawn) {
                let startTime = Date.now()

                new Promise((resolve, reject) => {
                    if (ring.type === "useItem" && ring.awaitBatSpawn) addListener(() => resolve(Date.now() - startTime), (msg) => reject(msg), true)
                    else addListener(() => resolve(Date.now() - startTime), (msg) => reject(msg), false)
                    preRotate(ring)
                }).then(secretTime => {
                    playerPosition = playerCoords().player
                    let distance = getDistance2D(playerPosition[0], playerPosition[2], ringPos[0], ringPos[2])
                    if (distance < ring.radius && Math.abs(playerPosition[1] - ringPos[1]) <= ring.height) {
                        chat(`Awaiting for ${secretTime}ms.`)
                        Client.scheduleTask(1, exec)
                    } else stopRotating()
                }, // Nice linter, VS Code.
                    message => {
                        stopRotating()
                        chat(message)
                    })

            } else exec()
        } else if (extraRingData.triggered) extraRingData.triggered = false
    })
    // }
}

let lastRoomName
register("step", () => {
    if (!Settings().autoRoutesEnabled) return
    if (getRoomName() === lastRoomName) return
    lastRoomName = getRoomName()
    updateRoutes()
}).setFps(10)

const updateRoutes = () => {
    roomNodes = data.profiles[data.selectedProfile][getRoomName()]
    activeNodes = []
    if (!roomNodes || !roomNodes.length) {
        return chat("No routes found for this room!")
    }

    activeNodes = roomNodes
    activeNodesCoords = []
    for (let i = 0; i < activeNodes.length; i++) {
        let nodeToPush = {}
        let node = activeNodes[i]
        let [x, y, z] = convertFromRelative(node.position) // What the fuck is this
        x += 0.5
        y += node.yOffset
        z += 0.5
        nodeToPush.position = [x, y, z]
        nodeToPush.triggered = false
        nodeToPush.lastUse = 0
        if (node.type === "etherwarp") {
            if (node.etherCoordMode === 0) nodeToPush.etherBlockCoord = convertFromRelative(node.etherBlock)
            else nodeToPush.etherBlockCoord = rayTraceEtherBlock([x, y + getEyeHeightSneaking(), z], convertToRealYaw(node.yaw), node.pitch)
        }
        activeNodesCoords.push(nodeToPush)
    }
    chat("Routes updated for current room.")
}

register("command", () => {
    updateRoutes()
}).setName("updateroutes")

const ringActions = {
    look: (args) => {
        let [yaw, pitch] = [convertToRealYaw(args.yaw), args.pitch]
        rotate(yaw, pitch)
    },
    etherwarp: (args) => {
        const rotation = getEtherYawPitchFromArgs(args)
        if (!rotation) return
        const success = swapFromName("Aspect of The Void")
        if (!success) return
        let time = Date.now()
        const execRing = () => {
            ChatLib.chat(Date.now() - time)
            releaseMovementKeys()
            Player.getPlayer().func_70016_h(0, Player.getPlayer().field_70181_x, 0)
            setSneaking(true)
            clickAt(rotation[0], rotation[1])
            moveKeyListener = true
            moveKeyCooldown = Date.now()
        }
        // U CANT PUT A SCHEDULETASK IN A SCHEDULETASK SO IM JUST USING ASYNC SCHEDULE AND THEN SCHEDULING THE TASK SHOUTOUT TO CT BTW
        if (success === 2) Async.schedule(() => Client.scheduleTask(0, execRing), 40) // If success is equal to 2 that means you weren't holding the item before and we need to wait a tick for you to actually be holding the item.
        else execRing()

    },
    useItem: (args) => {
        let [yaw, pitch] = [convertToRealYaw(args.yaw), args.pitch]
        const success = swapFromName(args.itemName)
        if (!success) return
        let time = Date.now()
        const execRing = () => {
            ChatLib.chat(Date.now() - time)
            if (args.stopSneaking) setSneaking(false)
            clickAt(yaw, pitch)
        }
        if (success === 2) Async.schedule(() => Client.scheduleTask(0, execRing), 40)
        else execRing()
    },
    walk: (args) => {
        let [yaw, pitch] = [convertToRealYaw(args.yaw), args.pitch]
        rotate(yaw, pitch)
        setWalking(true)
        setSneaking(false)
    },
    superboom: (args) => {
        let [yaw, pitch] = [convertToRealYaw(args.yaw), args.pitch]
        rotate(yaw, pitch)
        const success = swapFromItemID(46)
        if (!success) return
        Async.schedule(() => Client.scheduleTask(0, leftClick), 40)
    },
    pearlclip: (args) => {
        const success = swapFromName("Ender Pearl")
        if (!success) return
        const execRing = () => {
            clickAt(0, 90)
            registerPearlClip(args.pearlClipDistance)
        }
        if (success === 2) Async.schedule(() => Client.scheduleTask(0, execRing), 40)
        else execRing()
    }
}

register(net.minecraftforge.fml.common.gameevent.InputEvent.KeyInputEvent, () => {
    if (!moveKeyListener) return
    if (Date.now() - moveKeyCooldown < 60) return
    if (Client.isInGui() || !World.isLoaded()) return
    if (!Keyboard.getEventKeyState()) return
    const keyCode = Keyboard.getEventKey()
    if (!keyCode) return

    if (movementKeys.includes(keyCode)) {
        moveKeyListener = false
        setSneaking(false)
        stopRotating()
    }
})

/*
let packetsSent = 0
register("packetSent", (packet, event) => {
    Client.scheduleTask(0, () => {
        if (event?.isCancelled()) return

        packetsSent++
    })
}).setFilteredClass(net.minecraft.network.play.client.C03PacketPlayer)

register("step", () => {
    if (!Settings().debugMessages) return
    ChatLib.clearChat(89299)
    new Message(`§0[§6AutoRoutesDebug§0]§f Movement packets sent last second: ${packetsSent}`).setChatLineId(89299).chat()
    packetsSent = 0
}).setDelay(1)
*/

const preRotate = (ringArgs) => {
    if (!["look", "etherwarp", "useItem", "walk", "finish", "superboom"].includes(ringArgs.type)) return

    let yaw
    let pitch
    if (ringArgs.type === "etherwarp") {
        const yawPitch = getEtherYawPitchFromArgs(ringArgs)
        if (!yawPitch) return
        [yaw, pitch] = yawPitch
    } else {
        [yaw, pitch] = [convertToRealYaw(ringArgs.yaw), ringArgs.pitch]
    }
    prepareRotate(yaw, pitch)
}
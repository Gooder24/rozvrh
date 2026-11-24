# Časovač obnovy (asus)

Zapnúť:

    systemctl --user link ~/projects/rozvrh/systemd/rozvrh-obnova.service
    systemctl --user enable --now ~/projects/rozvrh/systemd/rozvrh-obnova.timer

Vypnúť: `systemctl --user disable --now rozvrh-obnova.timer`

Stav a posledný beh: `systemctl --user list-timers rozvrh-obnova.timer`, `journalctl --user -u rozvrh-obnova`,
`data/obnova/posledny-beh.json`. Beh hneď mimo časovača: `bun prieskum/obnova.ts --teraz` (alebo `--plna`).
Keď poistka nenahradí dáta, zapíše riadok do inboxu na asuse a beh skončí s chybou.

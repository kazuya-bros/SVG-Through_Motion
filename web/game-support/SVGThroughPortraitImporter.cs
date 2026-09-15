// SVG-Through generated portrait importer. Editor-only; uses standard Unity assets.
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

public static class SVGThroughPortraitImporter
{
    [MenuItem("Assets/SVG-Through/Create Portrait Prefab")]
    public static void Create()
    {
        string selected = AssetDatabase.GetAssetPath(Selection.activeObject);
        string folder = AssetDatabase.IsValidFolder(selected) ? selected : Path.GetDirectoryName(selected);
        folder = (folder ?? "").Replace('\\', '/');
        string[] names = { "base", "eye_open", "eye_mid", "eye_close", "mouth_close", "mouth_mid", "mouth_open" };
        foreach (string name in names)
            if (!(AssetImporter.GetAtPath(folder + "/" + name + ".png") is TextureImporter))
            {
                EditorUtility.DisplayDialog("SVG-Through", "Select base.png in the exported character folder. Missing: " + name, "OK");
                return;
            }
        var sprites = new Sprite[names.Length];
        for (int i = 0; i < names.Length; i++)
        {
            string path = folder + "/" + names[i] + ".png";
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.spritePixelsPerUnit = 100;
            importer.mipmapEnabled = false;
            importer.alphaSource = TextureImporterAlphaSource.FromInput;
            importer.alphaIsTransparency = false;
            importer.filterMode = FilterMode.Point;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.maxTextureSize = 2048;
            var settings = new TextureImporterSettings();
            importer.ReadTextureSettings(settings);
            settings.spriteAlignment = (int)SpriteAlignment.Custom;
            settings.spritePivot = new Vector2(.5f, 0);
            settings.spriteMeshType = SpriteMeshType.FullRect;
            importer.SetTextureSettings(settings);
            importer.SaveAndReimport();
            sprites[i] = AssetDatabase.LoadAssetAtPath<Sprite>(path);
        }
        string output = AssetDatabase.GenerateUniqueAssetPath(folder + "/Generated");
        AssetDatabase.CreateFolder(folder, Path.GetFileName(output));
        var root = new GameObject(Path.GetFileName(folder));
        root.AddComponent<UnityEngine.Rendering.SortingGroup>();
        try
        {
            AddPart(root, "Base", sprites[0], 0);
            var eye = AddPart(root, "Eyes", sprites[1], 1);
            var mouth = AddPart(root, "Mouth", sprites[4], 2);
            var blink = Clip(output, "Blink", new[] { sprites[1], sprites[2], sprites[3], sprites[2], sprites[1], sprites[1] }, new[] { 0f, 4f, 4.08f, 4.16f, 4.24f, 4.5f }, true);
            var closed = Clip(output, "Closed", new[] { sprites[4], sprites[4] }, new[] { 0f, .1f }, true);
            var talk = Clip(output, "Talk", new[] { sprites[4], sprites[5], sprites[6], sprites[5], sprites[4] }, new[] { 0f, .08f, .16f, .24f, .32f }, true);
            var eyes = AnimatorController.CreateAnimatorControllerAtPath(output + "/Eyes.controller");
            var blinkState = eyes.layers[0].stateMachine.AddState("Blink");
            blinkState.motion = blink;
            eyes.layers[0].stateMachine.defaultState = blinkState;
            eye.AddComponent<Animator>().runtimeAnimatorController = eyes;
            var mouths = AnimatorController.CreateAnimatorControllerAtPath(output + "/Mouth.controller");
            mouths.AddParameter("Talking", AnimatorControllerParameterType.Bool);
            var machine = mouths.layers[0].stateMachine;
            var idle = machine.AddState("Closed"); idle.motion = closed;
            var talking = machine.AddState("Talking"); talking.motion = talk;
            machine.defaultState = idle;
            var begin = idle.AddTransition(talking); begin.hasExitTime = false; begin.duration = 0;
            begin.AddCondition(AnimatorConditionMode.If, 0, "Talking");
            var end = talking.AddTransition(idle); end.hasExitTime = false; end.duration = 0;
            end.AddCondition(AnimatorConditionMode.IfNot, 0, "Talking");
            mouth.AddComponent<Animator>().runtimeAnimatorController = mouths;
            var prefab = PrefabUtility.SaveAsPrefabAsset(root, output + "/Portrait.prefab");
            AssetDatabase.SaveAssets();
            Selection.activeObject = prefab;
            EditorGUIUtility.PingObject(prefab);
        }
        finally { UnityEngine.Object.DestroyImmediate(root); }
    }

    static GameObject AddPart(GameObject root, string name, Sprite sprite, int order)
    {
        var part = new GameObject(name); part.transform.SetParent(root.transform, false);
        var renderer = part.AddComponent<SpriteRenderer>(); renderer.sprite = sprite; renderer.sortingOrder = order;
        return part;
    }

    static AnimationClip Clip(string folder, string name, Sprite[] sprites, float[] times, bool loop)
    {
        var clip = new AnimationClip { name = name, frameRate = 25 };
        var keys = new ObjectReferenceKeyframe[sprites.Length];
        for (int i = 0; i < sprites.Length; i++) keys[i] = new ObjectReferenceKeyframe { time = times[i], value = sprites[i] };
        var binding = new EditorCurveBinding { path = "", type = typeof(SpriteRenderer), propertyName = "m_Sprite" };
        AnimationUtility.SetObjectReferenceCurve(clip, binding, keys);
        var settings = AnimationUtility.GetAnimationClipSettings(clip); settings.loopTime = loop;
        AnimationUtility.SetAnimationClipSettings(clip, settings);
        AssetDatabase.CreateAsset(clip, folder + "/" + name + ".anim");
        return clip;
    }
}
